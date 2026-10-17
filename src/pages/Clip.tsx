import TakeOneLogo from "../components/TakeOneLogo";
import { useState } from "react";
import { ArrowUpRight, FilmStrip, LinkSimple } from "@phosphor-icons/react";
import { button } from "../lib/ui";
import { PanelState } from "../components/StudioWorkspace";
import { useQuery } from 'convex/react';
import { Link, useParams } from 'react-router-dom';
import { SHARE_TOKEN, type SharedMoment } from '../../convex/youtubeValues';
import { MomentCard } from '../components/YouTubeMoments';
import { api, convexEnabled } from '../lib/convexApi';

function Unavailable() {
  return <main className="clip-shell px-6 py-24 text-center">
    <FilmStrip size={40} weight="regular" className="mx-auto mb-6" aria-hidden="true" /><p className="eyebrow mb-3">TakeOne / Shared moment</p><h1 className="font-display font-semibold text-5xl">Moment unavailable</h1>
    <p className="mt-4 text-ink2">This link is invalid or the moment was removed.</p><Link to="/" className={`${button("secondary")} mt-6`}>Back to TakeOne</Link>
  </main>;
}

export default function Clip() {
  const { id = '' } = useParams();
  return convexEnabled && SHARE_TOKEN.test(id) ? <SharedMomentPage key={id} token={id} /> : <Unavailable />;
}

function SharedMomentPage({ token }: { token: string }) {
  const [copied, setCopied] = useState('');
  const copyLink = async () => {
    try { await navigator.clipboard.writeText(window.location.href); setCopied('Link copied.'); }
    catch { setCopied('Copy this page address from your browser.'); }
  };
  const data = useQuery(api.youtubeMoments.shared, { token }) as SharedMoment | null | undefined;
  if (data === null) return <Unavailable />;
  return <main className="clip-shell px-5 py-7 sm:px-8">
    <header className="mx-auto mb-10 flex max-w-5xl items-center justify-between border-b border-line pb-4"><Link to="/" className="inline-flex items-center gap-2 font-display font-semibold text-xl"><TakeOneLogo className="h-6 w-6" />TakeOne</Link><span className="eyebrow flex items-center gap-2"><LinkSimple size={18} aria-hidden="true" />Shared moment</span></header><h1 className="sr-only">A shared moment</h1>
    <div className="clip-moment mx-auto max-w-lg">
      {data === undefined
        ? <PanelState loading>Loading the moment…</PanelState>
        : <MomentCard videoId={data.videoId} moment={data.moment} />}
      <p className="mt-5 text-sm"><Link to="/" className="underline underline-offset-4">Shared from TakeOne</Link></p>
      <div className="mt-5 flex flex-wrap gap-3 border-t border-line pt-4 text-sm"><button type="button" onClick={() => void copyLink()} className={button("secondary")}><LinkSimple size={18} aria-hidden="true" />Copy share link</button><Link to="/create" className={button("primary")}>Create your own cut <ArrowUpRight size={18} aria-hidden="true" /></Link><p role="status" className="w-full text-[13px] text-ink2">{copied}</p></div>
    </div>
  </main>;
}
