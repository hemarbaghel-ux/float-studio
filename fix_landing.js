const fs = require('fs');
let code = fs.readFileSync('src/features/landing/LandingPage.tsx', 'utf8');

// replace handleStart function with a simpler one
code = code.replace(/const handleStart = \(\) => \{[\s\S]*?useIDEStore\.getState\(\)\.startSession\(\);\s*\};/, `const handleStart = () => {
    useIDEStore.getState().startSession();
  };`);

fs.writeFileSync('src/features/landing/LandingPage.tsx', code);
