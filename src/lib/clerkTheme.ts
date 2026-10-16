export const clerkAppearance = {
  variables: {
    colorPrimary: '#151515',
    colorBackground: '#f5f4f0',
    colorText: '#151515',
    colorTextSecondary: '#686868',
    colorInputBackground: '#ffffff',
    colorInputText: '#151515',
    borderRadius: '0.75rem',
    fontFamily: 'Inter, ui-sans-serif, system-ui, sans-serif',
  },
  elements: {
    modalBackdrop: {
      backgroundColor: 'rgba(20, 20, 20, 0.68)',
      backdropFilter: 'blur(4px)',
    },
    modalContent: {
      borderRadius: '1.25rem',
      boxShadow: '0 24px 70px rgba(0, 0, 0, 0.22)',
      overflow: 'hidden',
      backgroundColor: '#f5f4f0',
      border: '1px solid rgba(21, 21, 21, 0.12)',
    },
    navbar: {
      backgroundColor: '#f5f4f0',
      borderRight: '1px solid rgba(21, 21, 21, 0.1)',
    },
    navbarButton: {
      borderRadius: '0.75rem',
      color: '#525252',
      fontWeight: 600,
    },
    navbarButton__active: {
      backgroundColor: '#151515',
      color: '#ffffff',
    },
    scrollBox: {
      backgroundColor: '#ffffff',
    },
    pageScrollBox: {
      backgroundColor: '#ffffff',
    },
    actionCard: {
      width: '100%',
      padding: '1.25rem',
      border: '1px solid rgba(21, 21, 21, 0.1)',
      borderRadius: '1rem',
      backgroundColor: '#fafaf8',
      boxShadow: 'none',
    },
    formFieldInput: {
      minHeight: '2.75rem',
      border: '1px solid rgba(21, 21, 21, 0.16)',
      borderRadius: '0.75rem',
      boxShadow: 'none',
      outlineColor: '#151515',
    },
    formButtonPrimary: {
      minHeight: '2.5rem',
      borderRadius: '0.75rem',
      backgroundColor: '#151515',
      fontWeight: 600,
      boxShadow: 'none',
    },
    formButtonReset: {
      color: '#555555',
      fontWeight: 600,
    },
    profileSectionPrimaryButton: {
      color: '#151515',
      fontWeight: 600,
    },
    profileSection__danger: {
      display: 'none',
    },
    profileSection: {
      borderBottom: '1px solid rgba(21, 21, 21, 0.1)',
    },
    profileSectionTitle: {
      color: '#151515',
      fontWeight: 700,
    },
    profileSectionContent: {
      color: '#555555',
    },
    badge: {
      backgroundColor: '#efeee9',
      color: '#3f3f3f',
    },
    menuButton: {
      color: '#151515',
    },
  },
} as const;

export const clerkLocalization = {
  userProfile: {
    navbar: {
      title: 'Account',
      description: 'Manage your TakeOne account.',
    },
    start: {
      passwordSection: {
        primaryButton__setPassword: 'Add password',
      },
    },
    passwordPage: {
      title__set: 'Add a sign-in password',
      checkboxInfoText__signOutOfOtherSessions: 'Recommended if you have signed in on a shared device.',
    },
  },
} as const;
