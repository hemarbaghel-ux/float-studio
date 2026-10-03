const fs = require('fs');

function replaceInFile(filePath) {
  let code = fs.readFileSync(filePath, 'utf8');
  let original = code;
  
  code = code.replace(/PyPilot/g, 'FLOAT');
  code = code.replace(/pypilot/g, 'float');
  
  if (code !== original) {
    fs.writeFileSync(filePath, code);
    console.log('Updated ' + filePath);
  }
}

replaceInFile('src/features/ai/registry.ts');
replaceInFile('src/features/landing/LandingPage.tsx');
replaceInFile('src/features/onboarding/OnboardingFlow.tsx');
replaceInFile('src/features/dashboard/Dashboard.tsx');

let index = fs.readFileSync('index.html', 'utf8');
let originalIndex = index;
index = index.replace(/<title>.*<\/title>/, '<title>FLOAT</title>');
if (index !== originalIndex) {
  fs.writeFileSync('index.html', index);
  console.log('Updated index.html');
}

let metadata = JSON.parse(fs.readFileSync('metadata.json', 'utf8'));
metadata.name = 'FLOAT';
metadata.description = 'AI-powered Python learning and coding platform.';
fs.writeFileSync('metadata.json', JSON.stringify(metadata, null, 2));
console.log('Updated metadata.json');
