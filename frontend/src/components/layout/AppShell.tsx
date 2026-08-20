import { useState } from "react";
import { Outlet } from "react-router-dom";
import { Sidebar } from "./Sidebar";
import { Topbar } from "./Topbar";
import RaiseTicketModal from "@/components/ui/RaiseTicketModal";

export function AppShell() {
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [ticketOpen, setTicketOpen] = useState(false);

  return (
    <>
      <div className="flex h-screen overflow-hidden bg-canvas">
        <Sidebar
          mobileOpen={mobileNavOpen}
          onCloseMobile={() => setMobileNavOpen(false)}
        />

        <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
          <Topbar
            {...({
              onOpenMobileNav: () => setMobileNavOpen(true),
              onRaiseTicket: () => setTicketOpen(true),
            } as any)}
          />

          <main className="flex-1 overflow-y-auto py-6" style={{ scrollbarGutter: "stable" }}>
            <div className="mx-auto w-full max-w-[1400px] animate-fade-up px-4 sm:px-6 lg:px-8">
              <Outlet />
            </div>
          </main>
        </div>
      </div>

      <RaiseTicketModal
        open={ticketOpen}
        onClose={() => setTicketOpen(false)}
      />
    </>
  );
}