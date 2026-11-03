const fs = require('fs');
const path = require('path');
const JSZip = require('jszip');

async function packageVsix() {
  console.log('=== Packaging FLOAT Studio VSIX Extension ===');

  const extensionDir = path.resolve(__dirname, '../extensions/float-vscodium-poc');
  const pkgJsonPath = path.join(extensionDir, 'package.json');
  const pkg = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf8'));

  const distDir = path.resolve(__dirname, '../dist');
  if (!fs.existsSync(distDir)) {
    fs.mkdirSync(distDir, { recursive: true });
  }

  const vsixFileName = `${pkg.name}-${pkg.version}.vsix`;
  const vsixOutPath = path.join(distDir, vsixFileName);

  const zip = new JSZip();

  // 1. [Content_Types].xml
  const contentTypesXml = `<?xml version="1.0" encoding="utf-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="vsixmanifest" ContentType="text/xml"/>
  <Default Extension="json" ContentType="application/json"/>
  <Default Extension="js" ContentType="application/javascript"/>
  <Default Extension="map" ContentType="application/json"/>
  <Default Extension="md" ContentType="text/markdown"/>
  <Default Extension="png" ContentType="image/png"/>
  <Default Extension="svg" ContentType="image/svg+xml"/>
  <Default Extension="txt" ContentType="text/plain"/>
</Types>`;
  zip.file('[Content_Types].xml', contentTypesXml);

  // 2. extension.vsixmanifest
  const vsixManifestXml = `<?xml version="1.0" encoding="utf-8"?>
<PackageManifest Version="2.0.0" xmlns="http://schemas.microsoft.com/developer/vsx-schema/2011" xmlns:d="http://schemas.microsoft.com/developer/vsx-schema-design/2011">
  <Metadata>
    <Identity Id="${pkg.name}" Version="${pkg.version}" Publisher="${pkg.publisher}" Language="en-US"/>
    <DisplayName>${pkg.displayName.replace(/&/g, '&amp;')}</DisplayName>
    <Description xml:space="preserve">${pkg.description.replace(/&/g, '&amp;')}</Description>
    <Tags>${(pkg.categories || []).join(',')}</Tags>
    <Categories>${(pkg.categories || []).join(',')}</Categories>
    <GalleryFlags>Public</GalleryFlags>
    <Properties>
      <Property Id="Microsoft.VisualStudio.Code.Engine" Value="${pkg.engines?.vscode || '^1.85.0'}"/>
      <Property Id="Microsoft.VisualStudio.Code.ExtensionDependencies" Value=""/>
      <Property Id="Microsoft.VisualStudio.Code.ExtensionPack" Value=""/>
      <Property Id="Microsoft.VisualStudio.Code.LocalizedLanguages" Value=""/>
    </Properties>
  </Metadata>
  <Installation>
    <InstallationTarget Id="Microsoft.VisualStudio.Code"/>
  </Installation>
  <Dependencies/>
  <Assets>
    <Asset Type="Microsoft.VisualStudio.Code.Manifest" Path="extension/package.json" Addressable="true"/>
    <Asset Type="Microsoft.VisualStudio.Services.Content.Details" Path="extension/README.md" Addressable="true"/>
  </Assets>
</PackageManifest>`;
  zip.file('extension.vsixmanifest', vsixManifestXml);

  // 3. Extension files under `extension/`
  // Add package.json
  zip.file('extension/package.json', fs.readFileSync(pkgJsonPath, 'utf8'));

  // Add README.md
  const readmePath = path.join(extensionDir, 'README.md');
  if (fs.existsSync(readmePath)) {
    zip.file('extension/README.md', fs.readFileSync(readmePath, 'utf8'));
  }

  // Add dist/extension.js and dist/extension.js.map
  const bundleJsPath = path.join(extensionDir, 'dist/extension.js');
  if (!fs.existsSync(bundleJsPath)) {
    throw new Error(`Extension bundle not found at ${bundleJsPath}. Run build:extension first.`);
  }
  zip.file('extension/dist/extension.js', fs.readFileSync(bundleJsPath));

  const bundleMapPath = path.join(extensionDir, 'dist/extension.js.map');
  if (fs.existsSync(bundleMapPath)) {
    zip.file('extension/dist/extension.js.map', fs.readFileSync(bundleMapPath));
  }

  // Generate ZIP Buffer
  const buffer = await zip.generateAsync({
    type: 'nodebuffer',
    compression: 'DEFLATE',
    compressionOptions: { level: 9 },
  });

  fs.writeFileSync(vsixOutPath, buffer);
  const sizeMB = (buffer.length / (1024 * 1024)).toFixed(2);
  console.log(`[PASS] Packaged VSIX created: ${vsixOutPath} (${sizeMB} MB)`);
  return vsixOutPath;
}

if (require.main === module) {
  packageVsix().catch((err) => {
    console.error('[FAIL] Packaging failed:', err);
    process.exit(1);
  });
}

module.exports = { packageVsix };
