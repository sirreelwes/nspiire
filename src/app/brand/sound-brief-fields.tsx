const field =
  "rounded-xl border border-neutral-300 px-4 py-3.5 text-base dark:border-neutral-700 dark:bg-neutral-900";

/**
 * One song, the way a manager actually briefs it. Shared by the sign-up at
 * /music and the "add a song" form on the account page, so both submit the
 * field names brandApply() and addSoundBrief() read.
 */
export function SoundBriefFields({ compact = false }: { compact?: boolean }) {
  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="flex flex-col gap-2">
          <span className="text-base font-medium">Artist</span>
          <input name="artistName" required className={field} />
        </label>
        <label className="flex flex-col gap-2">
          <span className="text-base font-medium">The song</span>
          <input
            name="trackUrl"
            inputMode="url"
            required
            placeholder="TikTok sound, Spotify or SoundCloud link"
            className={field}
          />
        </label>
      </div>
      <label className="flex flex-col gap-2">
        <span className="text-base font-medium">The feeling, in one line</span>
        <input
          name="mood"
          placeholder="Main-character energy. Late drive home. Getting ready."
          className={field}
        />
        {!compact && (
          <span className="text-sm text-neutral-500">
            This is what I match creators against. The less you script, the
            better the videos land.
          </span>
        )}
      </label>
      <label className="flex flex-col gap-2">
        <span className="text-base font-medium">Whose videos should it be in?</span>
        <textarea
          name="lookingFor"
          rows={2}
          placeholder="Fitness, get-ready-with-me, study-with-me. Not music accounts."
          className={field}
        />
      </label>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="flex flex-col gap-2">
          <span className="text-base font-medium">How many videos</span>
          <input name="videosWanted" inputMode="numeric" placeholder="20" className={field} />
        </label>
        <label className="flex flex-col gap-2">
          <span className="text-base font-medium">Posting window</span>
          <input name="postingWindow" placeholder="Oct 3–10" className={field} />
        </label>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="flex flex-col gap-2">
          <span className="text-base font-medium">Budget for the wave</span>
          <input name="budgetRange" placeholder="$2k–$5k" className={field} />
        </label>
        <label className="flex flex-col gap-2">
          <span className="text-base font-medium">Release date</span>
          <input name="releaseDate" placeholder="Out now, or Oct 1" className={field} />
        </label>
      </div>
    </div>
  );
}
