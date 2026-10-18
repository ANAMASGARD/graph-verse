import { SignIn } from "@clerk/nextjs";
import { clerkAppearance } from "@/lib/clerk-appearance";

export default function SignInPage() {
  return (
    <div className="dark flex min-h-screen items-center justify-center bg-[#050505] px-4 py-10">
      <SignIn appearance={clerkAppearance} />
    </div>
  );
}
