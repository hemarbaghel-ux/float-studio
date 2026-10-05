import React from 'react';
import { Dashboard } from '../dashboard/Dashboard';

interface LoginPageProps {
  onClose?: () => void;
  isModal?: boolean;
}

export function LoginPage({ onClose, isModal = false }: LoginPageProps) {
  return <Dashboard initialTab="new-chat" />;
}
