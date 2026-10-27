import { CheckIcon } from "lucide-react";

import { Logo } from "@/components/shared/logo";
import { ModeToggle } from "@/components/shared/mode-toggle";

const highlights = [
  "Run several shops from one organisation",
  "Live stock across every warehouse",
  "Delivery tracking with OTP handover",
];

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-svh lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
      <aside className="hidden flex-col justify-between bg-sidebar p-12 text-sidebar-foreground lg:flex">
        <Logo className="text-sidebar-accent-foreground" />
        <div className="space-y-8">
          <h2 className="max-w-md text-4xl leading-tight font-semibold tracking-tight text-sidebar-accent-foreground">
            Every shop, every warehouse, every delivery. One login.
          </h2>
          <ul className="space-y-4">
            {highlights.map((item) => (
              <li key={item} className="flex items-center gap-3">
                <span className="flex size-6 items-center justify-center rounded-full bg-sidebar-primary text-sidebar-primary-foreground">
                  <CheckIcon className="size-3.5" aria-hidden="true" />
                </span>
                {item}
              </li>
            ))}
          </ul>
        </div>
        <p className="text-sm opacity-70">
          Protected by email one-time codes. No passwords to leak.
        </p>
      </aside>

      <main className="flex flex-col">
        <header className="flex items-center justify-between p-6 lg:justify-end">
          <Logo className="lg:hidden" />
          <ModeToggle />
        </header>
        <div className="flex flex-1 items-center justify-center px-6 pb-16">
          <div className="w-full max-w-sm">{children}</div>
        </div>
      </main>
    </div>
  );
}
