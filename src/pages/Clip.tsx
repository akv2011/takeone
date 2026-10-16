import { useQuery } from 'convex/react';
import { Link, useParams } from 'react-router-dom';
import { SHARE_TOKEN, type SharedMoment } from '../../convex/youtubeValues';
import { MomentCard } from '../components/YouTubeMoments';
import { api, convexEnabled } from '../lib/convexApi';

function Unavailable() {
  return <main className="min-h-screen bg-paper px-6 py-24 text-center text-ink">
    <h1 className="font-display text-4xl font-extrabold">Moment unavailable</h1>
    <p className="mt-4 text-muted">This link is invalid or the moment was removed.</p>
  </main>;
}

export default function Clip() {
  const { id = '' } = useParams();
  return convexEnabled && SHARE_TOKEN.test(id) ? <SharedMomentPage key={id} token={id} /> : <Unavailable />;
}

function SharedMomentPage({ token }: { token: string }) {
  const data = useQuery(api.youtubeMoments.shared, { token }) as SharedMoment | null | undefined;
  if (data === null) return <Unavailable />;
  return <main className="min-h-screen bg-paper px-4 py-10 text-ink">
    <h1 className="sr-only">A shared moment</h1>
    <div className="mx-auto max-w-sm">
      {data === undefined
        ? <div role="status" className="aspect-[9/16] rounded-xl bg-line motion-safe:animate-pulse"><span className="sr-only">Loading the moment…</span></div>
        : <MomentCard videoId={data.videoId} moment={data.moment} />}
      <p className="mt-4 text-center text-sm"><Link to="/" className="font-semibold text-muted underline-offset-4 hover:text-ink hover:underline">Shared from TakeOne</Link></p>
    </div>
  </main>;
}
