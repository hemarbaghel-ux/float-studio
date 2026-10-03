import React from 'react';
import { SignUpPage } from './SignUpPage';

interface AuthModalProps {
  onClose: () => void;
  initialMode?: 'signup' | 'signin';
}

export function AuthModal({ onClose, initialMode = 'signup' }: AuthModalProps) {
  return <SignUpPage initialMode={initialMode} onClose={onClose} isModal={true} />;
}

