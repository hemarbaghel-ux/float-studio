const fs = require('fs');
let code = fs.readFileSync('src/features/landing/LandingPage.tsx', 'utf8');

code = code.replace(
  `import { useIDEStore } from '../../store';`,
  `import { useIDEStore } from '../../store';\nimport { AuthModal } from '../auth/AuthModal';\nimport { useState } from 'react';`
);

code = code.replace(
  `export function LandingPage() {
  const { startSession } = useIDEStore();`,
  `export function LandingPage() {
  const { startSession } = useIDEStore();
  const [showAuthModal, setShowAuthModal] = useState(false);`
);

code = code.replace(
  `const handleStart = () => {
    startSession();
  };`,
  `const handleStart = () => {
    setShowAuthModal(true);
  };`
);

code = code.replace(
  `    </div>
  );
}`,
  `      {showAuthModal && <AuthModal onClose={() => setShowAuthModal(false)} />}
    </div>
  );
}`
);

fs.writeFileSync('src/features/landing/LandingPage.tsx', code);
