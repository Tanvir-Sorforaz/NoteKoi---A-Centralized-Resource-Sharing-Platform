import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function HomePage() {
  return (
    <div className="flex flex-col gap-8">
      <section className="flex flex-col gap-4">
        <p className="text-sm font-medium uppercase tracking-widest text-muted-foreground">NoteKoi</p>
        <h1 className="text-3xl font-semibold tracking-tight md:text-4xl">
          Course notes, shared by the people who take the course.
        </h1>
        <p className="max-w-2xl text-muted-foreground">
          Students upload notes that their class representative reviews. Teachers publish lecture material to the
          batches they teach. Everything stays inside your college until someone deliberately shares it wider.
        </p>
        <div className="flex flex-wrap gap-3">
          <Button asChild size="lg">
            <Link href="/register">Create an account</Link>
          </Button>
          <Button asChild size="lg" variant="outline">
            <Link href="/login">Sign in</Link>
          </Button>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>Students</CardTitle>
            <CardDescription>Upload to your college and let your CR approve it.</CardDescription>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>CR &amp; Co-CR</CardTitle>
            <CardDescription>Moderate your own department and session, promote good material.</CardDescription>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Teachers</CardTitle>
            <CardDescription>Keep files private, then publish to batches or the whole platform.</CardDescription>
          </CardHeader>
        </Card>
      </section>

      <Card>
        <CardContent className="p-6 text-sm text-muted-foreground">
          Demo accounts are created by <code className="rounded bg-muted px-1 py-0.5">npm run db:seed</code> (see the
          handoff note in the playbook). They all use the <code className="rounded bg-muted px-1 py-0.5">SEED_PASSWORD</code>{" "}
          from <code className="rounded bg-muted px-1 py-0.5">apps/api/.env</code>.
        </CardContent>
      </Card>
    </div>
  );
}
