import { SignUp } from "@clerk/nextjs";
import { clerkAppearance } from "@/lib/clerk-appearance";

export default function SignUpPage() {
  return (
    <div className="dark flex min-h-screen items-center justify-center bg-[#050505] px-4 py-10">
      <SignUp appearance={clerkAppearance} />
    </div>
  );
}
