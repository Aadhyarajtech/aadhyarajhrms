import { Link } from "react-router-dom";
import { BrandWordmark } from "@/components/layout/BrandMark";
import { Button } from "@/components/ui/Button";

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-canvas px-6 text-center">
      <BrandWordmark />
      <div>
        <p className="font-display text-6xl font-semibold text-brand-500">404</p>
        <h1 className="mt-2 font-display text-xl font-medium text-ink">This page wandered off.</h1>
        <p className="mt-2 text-sm text-ink-faint">The page you're looking for doesn't exist or may have moved.</p>
      </div>
      <Link to="/app/dashboard">
        <Button>Back to dashboard</Button>
      </Link>
    </div>
  );
}
