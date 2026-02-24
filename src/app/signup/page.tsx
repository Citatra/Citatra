import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { SignupForm } from "@/components/auth/signup-form";

export default async function SignupPage() {
  let session = null;
  try {
    session = await auth();
  } catch {
    // Stale/corrupt session cookie — ignore and show signup form
  }
  if (session?.user) {
    redirect("/dashboard");
  }
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-md space-y-8">
        <div className="text-center">
          <h1 className="text-3xl font-bold tracking-tight">Citatra</h1>
          <p className="mt-2 text-muted-foreground">
            Create your account to start monitoring AI visibility
          </p>
        </div>
        <SignupForm />
      </div>
    </div>
  );
}
