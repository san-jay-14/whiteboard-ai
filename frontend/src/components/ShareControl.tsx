import { useState } from 'react';
import { inviteMemberByEmail } from '../lib/boards';
import { errorMessage as extractErrorMessage } from '../lib/errors';

type Props = {
  boardId: string;
};

// Owner-only invite-by-email (step 12). Rendered as an embeddable form inside
// the hamburger menu (see Menu.tsx); only shown when the current user owns
// the board.
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
    <div className="px-2.5 py-1.5">
      <div className="mb-1.5 text-xs font-medium text-neutral-500 dark:text-neutral-400">Invite by email</div>
      <div className="flex gap-1">
        <input
          value={email}
          onChange={(e) => {
            setEmail(e.target.value);
            if (status !== 'sending') setStatus('idle');
          }}
          onKeyDown={(e) => e.key === 'Enter' && handleInvite()}
          placeholder="teammate@email.com"
          className="min-w-0 flex-1 rounded-md border border-neutral-200 bg-white px-2 py-1 text-sm text-neutral-700 outline-none focus:border-neutral-400 dark:border-neutral-600 dark:bg-neutral-900 dark:text-neutral-200 dark:focus:border-neutral-500"
        />
        <button
          type="button"
          onClick={handleInvite}
          disabled={status === 'sending'}
          className="shrink-0 rounded-md bg-violet-600 px-2.5 py-1 text-xs font-medium text-white transition-colors hover:bg-violet-700 disabled:opacity-50"
        >
          {status === 'sending' ? '…' : 'Invite'}
        </button>
      </div>
      {status === 'sent' && (
        <div className="mt-1 text-xs text-emerald-600 dark:text-emerald-400">
          Invited — they'll see it in their board list.
        </div>
      )}
      {status === 'error' && <div className="mt-1 text-xs text-rose-600 dark:text-rose-400">{errorMessage}</div>}
    </div>
  );
}
