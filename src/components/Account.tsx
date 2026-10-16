import { Link } from 'react-router-dom';
import { SignInButton, SignedIn, SignedOut } from '@clerk/clerk-react';
import { useQuery } from 'convex/react';
import { api } from '../lib/convexApi';
import TakeOneUserButton from './account/TakeOneUserButton';
function Balance() {
  const me = useQuery(api.users.currentUser) as { credits: number; freeRemaining: number } | null | undefined;
  return <span className="text-xs text-muted">{me?.freeRemaining ? `${me.freeRemaining} free left` : `${me?.credits ?? 0} credits`}</span>;
}
export default function Account() {
  return <>
    <SignedOut><SignInButton mode="modal"><button>Sign in</button></SignInButton></SignedOut>
    <SignedIn><div className="flex items-center gap-3"><Balance /><Link to="/create">Generate</Link><Link to="/pricing">Buy credits</Link><TakeOneUserButton /></div></SignedIn>
  </>;
}
