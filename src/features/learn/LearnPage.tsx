import React from 'react';
import { LearnHub } from './LearnHub';
import { LearnArticlePage } from './LearnArticlePage';
import { LearnGlossaryPage } from './LearnGlossaryPage';

interface LearnPageProps {
  pathname?: string;
}

export function LearnPage({ pathname = window.location.pathname }: LearnPageProps) {
  // Normalize pathname: remove trailing slash if not root
  const cleanPath = pathname.length > 1 && pathname.endsWith('/') 
    ? pathname.slice(0, -1) 
    : pathname;

  if (cleanPath === '/learn' || cleanPath === '/learn/') {
    return <LearnHub />;
  }

  if (cleanPath === '/learn/glossary') {
    return <LearnGlossaryPage />;
  }

  if (cleanPath === '/learn/tutorials') {
    // Show tutorials list by rendering LearnHub or tutorials view
    return <LearnHub />;
  }

  if (cleanPath.startsWith('/learn/tutorials/')) {
    const tutorialSlug = cleanPath.replace('/learn/tutorials/', '');
    return <LearnArticlePage slug={`tutorials/${tutorialSlug}`} />;
  }

  if (cleanPath.startsWith('/learn/')) {
    const articleSlug = cleanPath.replace('/learn/clean', '').replace('/learn/', '');
    return <LearnArticlePage slug={articleSlug} />;
  }

  return <LearnHub />;
}
