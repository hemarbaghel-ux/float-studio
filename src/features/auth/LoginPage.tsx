import React from 'react';
import { SignUpPage } from './SignUpPage';

interface LoginPageProps {
  onClose?: () => void;
  isModal?: boolean;
}

export function LoginPage({ onClose, isModal = false }: LoginPageProps) {
  return <SignUpPage initialMode="signin" onClose={onClose} isModal={isModal} />;
}
