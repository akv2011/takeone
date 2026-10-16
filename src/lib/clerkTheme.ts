// Clerk renders outside Tailwind, so these mirror the tokens in tailwind.config.js.
const ink = '#1A1F36';
const muted = '#5B6175';
const line = '#D6DAE1';
const paper = '#EEF0F3';
const surface = '#FFFFFF';
const cue = '#FFD23F';
const warn = '#B4430B';
const sans = "'Atkinson Hyperlegible Next', 'Atkinson Hyperlegible', system-ui, sans-serif";

export const clerkAppearance = {
  variables: {
    colorPrimary: ink,
    colorPrimaryForeground: surface,
    colorBackground: surface,
    colorForeground: ink,
    colorMutedForeground: muted,
    colorMuted: paper,
    colorInput: surface,
    colorInputForeground: ink,
    colorBorder: line,
    colorRing: ink,
    colorDanger: warn,
    borderRadius: '6px',
    fontFamily: sans,
    fontFamilyButtons: sans,
  },
  elements: {
    modalBackdrop: {
      backgroundColor: 'rgba(26, 31, 54, 0.6)',
    },
    modalContent: {
      borderRadius: '10px',
      boxShadow: 'none',
      overflow: 'hidden',
      backgroundColor: surface,
      border: `1px solid ${line}`,
    },
    navbar: {
      backgroundColor: paper,
      borderRight: `1px solid ${line}`,
    },
    navbarButton: {
      borderRadius: '6px',
      color: muted,
      fontWeight: 600,
    },
    navbarButton__active: {
      backgroundColor: cue,
      color: ink,
    },
    scrollBox: {
      backgroundColor: surface,
    },
    pageScrollBox: {
      backgroundColor: surface,
    },
    actionCard: {
      width: '100%',
      padding: '1.25rem',
      border: `1px solid ${line}`,
      borderRadius: '10px',
      backgroundColor: surface,
      boxShadow: 'none',
    },
    formFieldInput: {
      minHeight: '2.75rem',
      border: `1px solid ${line}`,
      borderRadius: '6px',
      boxShadow: 'none',
      outlineColor: ink,
    },
    formButtonPrimary: {
      minHeight: '2.5rem',
      borderRadius: '6px',
      backgroundColor: cue,
      color: ink,
      fontWeight: 700,
      boxShadow: 'none',
      '&:hover': { backgroundColor: cue, outline: `1px solid ${ink}` },
    },
    formButtonReset: {
      color: muted,
      fontWeight: 600,
    },
    profileSectionPrimaryButton: {
      color: ink,
      fontWeight: 600,
    },
    profileSection__danger: {
      display: 'none',
    },
    profileSection: {
      borderBottom: `1px solid ${line}`,
    },
    profileSectionTitle: {
      color: ink,
      fontWeight: 700,
    },
    profileSectionContent: {
      color: muted,
    },
    badge: {
      backgroundColor: paper,
      color: ink,
    },
    menuButton: {
      color: ink,
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
