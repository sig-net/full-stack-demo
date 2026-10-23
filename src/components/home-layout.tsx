import type { ReactNode } from 'react'

interface HomeLayoutProps {
  balances: ReactNode
  activity: ReactNode
  swap: ReactNode
}

/**
 * The home page grid. Below `md` the slots stack in the order swap, balances, activity and the page
 * scrolls. From `md` up it fills the viewport under the app bar and the page does not scroll:
 * balances above activity in the left pane, which scrolls when they outgrow it, and swap in the
 * fixed 413px right column, a flex column that a section whose root is `flex-1` fills.
 */
export function HomeLayout({ balances, activity, swap }: HomeLayoutProps): ReactNode {
  return (
    <main className="flex flex-1 flex-col gap-5 pt-5 md:grid md:min-h-0 md:basis-0 md:grid-cols-[minmax(0,1fr)_413px] md:grid-rows-1 md:gap-0 md:overflow-hidden md:pt-0">
      <div className="flex flex-col px-5 md:col-start-2 md:row-start-1 md:border-x md:bg-side-column md:px-0 md:pt-19.75">
        {swap}
      </div>
      <div className="flex flex-col gap-5 px-5 md:col-start-1 md:row-start-1 md:gap-20 md:overflow-y-auto md:pt-19.75 md:pr-10 md:pb-15 md:pl-[calc(100vw*60/1440)]">
        <div className="md:max-w-[calc(100vw*867/1440)]">{balances}</div>
        <div className="md:max-w-[calc(100vw*867/1440)]">{activity}</div>
      </div>
    </main>
  )
}
