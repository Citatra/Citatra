import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";

export default async function Home() {
  let session = null;
  try {
    session = await auth();
  } catch {
    // Stale/corrupt session cookie — treat as unauthenticated
  }
  if (session?.user) {
    redirect("/dashboard");
  }
  redirect("/login");
}
