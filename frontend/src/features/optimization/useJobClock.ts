import { useEffect, useState } from 'react'
import { jobClock, type JobClock } from './jobClock'
import { useLastJob } from './lastJobContext'

const TICK_MS = 250

/** The count of the last job (jobClock), redrawn a few times a second while it goes. */
export function useJobClock(): JobClock | null {
  const { state } = useLastJob()
  const [now, setNow] = useState(() => Date.now())
  // Whether there is a count does not depend on the time.
  const going = jobClock(state, 0) !== null
  useEffect(() => {
    if (!going) return
    const timer = setInterval(() => setNow(Date.now()), TICK_MS)
    return () => clearInterval(timer)
  }, [going])
  return jobClock(state, now)
}
