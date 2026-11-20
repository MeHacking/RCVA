import { useEffect, useRef, useState } from 'react'
import { useLocation } from 'react-router'
import { useLastJob } from '../features/optimization/lastJobContext'
import { NOTHING_SEEN, noticeFor, observeJob, type JobNotice, type SeenJob } from './jobNotices'

/** The screen with the results: a job that ends there needs no notification. */
export const RESULTS_PATH = '/optimization'

/** The notifications of this visit, newest first; opening Rezultati clears them. */
export function useJobNotices(): JobNotice[] {
  const { state } = useLastJob()
  const { pathname } = useLocation()
  const [notices, setNotices] = useState<JobNotice[]>([])
  const seen = useRef<SeenJob>(NOTHING_SEEN)
  const onResults = pathname === RESULTS_PATH

  // Running again for the same state (the screen changed) is harmless: an ended job is
  // reported once, as observeJob closes it.
  useEffect(() => {
    const { seen: next, ended } = observeJob(seen.current, state)
    seen.current = next
    if (ended && !onResults) {
      const notice = noticeFor(ended.job, ended.result, new Date())
      setNotices((list) => [notice, ...list])
    }
  }, [state, onResults])

  // Opening Rezultati reads them all (adjusted while rendering, not in an effect).
  if (onResults && notices.length > 0) setNotices([])

  return onResults ? [] : notices
}
