const fs = require('fs');

const p = 'src/features/models/ModelsFilteredPage.tsx';
let content = fs.readFileSync(p, 'utf8');

// Replace the ModelDetailsPanel component block
content = content.replace(/<ModelDetailsPanel[\s\S]*?\/>/g, '');

fs.writeFileSync(p, content);

const p2 = 'src/features/models/ModelsPage.tsx';
let content2 = fs.readFileSync(p2, 'utf8');

// Also in ModelsPage
content2 = content2.replace(/<ModelDetailsPanel[\s\S]*?\/>/g, '');
content2 = content2.replace(/import { ModelDetailsPanel } from '\.\/ModelDetailsPanel';/g, '');

fs.writeFileSync(p2, content2);
