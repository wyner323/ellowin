"use client"

import { Tabs as TabsPrimitive } from "@base-ui/react/tabs"

import { cn } from "@/lib/utils"

function Tabs({ className, ...props }: TabsPrimitive.Root.Props) {
  return (
    <TabsPrimitive.Root
      data-slot="tabs"
      className={cn("flex flex-col gap-4", className)}
      {...props}
    />
  )
}

function TabsList({ className, ...props }: TabsPrimitive.List.Props) {
  return (
    <TabsPrimitive.List
      data-slot="tabs-list"
      className={cn(
        "relative inline-flex w-fit items-center gap-1 rounded-xl bg-muted p-1 text-muted-foreground",
        className
      )}
      {...props}
    />
  )
}

function TabsTrigger({ className, ...props }: TabsPrimitive.Tab.Props) {
  return (
    <TabsPrimitive.Tab
      data-slot="tabs-trigger"
      className={cn(
        "relative z-10 inline-flex items-center gap-1.5 rounded-lg px-3.5 py-1.5 text-sm font-medium whitespace-nowrap text-muted-foreground transition-colors select-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 data-[selected]:text-foreground",
        className
      )}
      {...props}
    />
  )
}

function TabsIndicator({ className, ...props }: TabsPrimitive.Indicator.Props) {
  return (
    <TabsPrimitive.Indicator
      data-slot="tabs-indicator"
      className={cn(
        "absolute top-1 bottom-1 left-0 z-0 rounded-lg bg-card shadow-sm ring-1 ring-foreground/10 transition-[transform,width] duration-300 ease-out",
        className
      )}
      style={{
        width: "var(--active-tab-width)",
        transform: "translateX(var(--active-tab-left))",
      }}
      {...props}
    />
  )
}

function TabsContent({ className, ...props }: TabsPrimitive.Panel.Props) {
  return (
    <TabsPrimitive.Panel
      data-slot="tabs-content"
      className={cn(
        "animate-in fade-in-0 slide-in-from-bottom-1 duration-300 outline-none",
        className
      )}
      {...props}
    />
  )
}

export { Tabs, TabsList, TabsTrigger, TabsIndicator, TabsContent }
