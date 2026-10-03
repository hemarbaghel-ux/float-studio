const fs = require('fs');
let code = fs.readFileSync('src/features/landing/LandingPage.tsx', 'utf8');

code = code.replace(
  `export function LandingPage() {
  const { setProject } = useIDEStore();`,
  `export function LandingPage() {
  const { setProject } = useIDEStore();
  const [showAuthModal, setShowAuthModal] = useState(false);`
);

code = code.replace(
  `  const handleStart = () => {
    useIDEStore.getState().startSession();
  };`,
  `  const handleStart = () => {
    setShowAuthModal(true);
  };`
);

fs.writeFileSync('src/features/landing/LandingPage.tsx', code);
