import { useState } from 'react';
import { inviteMemberByEmail } from '../lib/boards';
import { errorMessage as extractErrorMessage } from '../lib/errors';

type Props = {
  boardId: string;
};

// Owner-only invite-by-email (step 12). Only rendered when the current user
// is the board's owner — see Canvas.tsx.
export default function ShareControl({ boardId }: Props) {
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState('');

  async function handleInvite() {
    const trimmed = email.trim();
    if (!trimmed || status === 'sending') return;
    setStatus('sending');
    try {
      await inviteMemberByEmail(boardId, trimmed);
      setStatus('sent');
      setEmail('');
      setTimeout(() => setStatus((s) => (s === 'sent' ? 'idle' : s)), 2500);
    } catch (e) {
      setStatus('error');
      setErrorMessage(extractErrorMessage(e));
    }
  }

  return (
    <div className="absolute right-4 top-20 z-10 w-60 rounded-lg bg-white p-2 shadow-md">
      <div className="mb-1 px-1 text-xs font-medium text-neutral-400">Invite by email</div>
      <div className="flex gap-1">
        <input
          value={email}
          onChange={(e) => {
            setEmail(e.target.value);
            if (status !== 'sending') setStatus('idle');
          }}
          onKeyDown={(e) => e.key === 'Enter' && handleInvite()}
          placeholder="teammate@email.com"
          className="min-w-0 flex-1 rounded-md border border-neutral-200 px-2 py-1 text-sm text-neutral-700 outline-none focus:border-neutral-400"
        />
        <button
          type="button"
          onClick={handleInvite}
          disabled={status === 'sending'}
          className="shrink-0 rounded-md bg-neutral-900 px-2.5 py-1 text-xs font-medium text-white transition-colors hover:bg-neutral-700 disabled:opacity-50"
        >
          {status === 'sending' ? '…' : 'Invite'}
        </button>
      </div>
      {status === 'sent' && <div className="mt-1 px-1 text-xs text-emerald-600">Invited — they'll see it in their board list.</div>}
      {status === 'error' && <div className="mt-1 px-1 text-xs text-rose-600">{errorMessage}</div>}
    </div>
  );
}
