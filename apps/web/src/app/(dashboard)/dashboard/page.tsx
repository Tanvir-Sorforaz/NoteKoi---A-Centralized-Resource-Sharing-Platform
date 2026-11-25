"use client";

import { RequireAuth } from "@/components/auth-guard";
import { EmptyState } from "@/components/states";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useMe } from "@/features/auth/hooks/use-auth";
import type { Me } from "@/features/auth/types";

const titleCase = (value: string): string =>
  value
    .split("_")
    .map((part) => part.charAt(0) + part.slice(1).toLowerCase())
    .join(" ");

function ProfileCard({ user }: { user: Me }) {
  const profile = user.profile;

  if (!profile) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Account</CardTitle>
          <CardDescription>Platform administrators have no student or teacher profile.</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const details: { label: string; value: string }[] =
    profile.kind === "student"
      ? [
          { label: "College", value: profile.college.name },
          { label: "Department", value: profile.department.name },
          { label: "Session", value: profile.session.name },
          { label: "Registration no.", value: profile.regNo },
        ]
      : [
          { label: "College", value: profile.college.name },
          { label: "Departments", value: profile.departments.map((row) => row.name).join(", ") || "—" },
        ];

  return (
    <Card>
      <CardHeader>
        <CardTitle>{profile.kind === "student" ? "Student profile" : "Teacher profile"}</CardTitle>
        <CardDescription>Verification status: {titleCase(profile.verificationStatus)}</CardDescription>
      </CardHeader>
      <CardContent>
        <dl className="grid gap-3 sm:grid-cols-2">
          {details.map((row) => (
            <div key={row.label} className="flex flex-col">
              <dt className="text-xs uppercase tracking-wide text-muted-foreground">{row.label}</dt>
              <dd className="text-sm font-medium">{row.value}</dd>
            </div>
          ))}
        </dl>
      </CardContent>
    </Card>
  );
}

function DashboardContent() {
  const me = useMe();
  const user = me.data;

  if (!user) return null;

  const verification = user.profile?.verificationStatus;
  const rejectedReason = user.profile?.rejectedReason;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">Hello, {user.name}</h1>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <Badge>{titleCase(user.type)}</Badge>
          <Badge variant={user.accountStatus === "ACTIVE" ? "success" : "destructive"}>
            {titleCase(user.accountStatus)}
          </Badge>
          <Badge variant={user.emailVerifiedAt ? "secondary" : "warning"}>
            {user.emailVerifiedAt ? "Email verified" : "Email not verified"}
          </Badge>
          <span className="text-muted-foreground">{user.email}</span>
        </div>
      </div>

      {verification === "PENDING_VERIFICATION" ? (
        <Alert variant="warning">
          <AlertTitle>Waiting for verification</AlertTitle>
          <AlertDescription>
            {user.type === "TEACHER"
              ? "Your college Sub Admin has to verify your teacher profile before you can upload."
              : "Your class representative has to verify your student profile before you can upload."}{" "}
            You can already browse once resources exist.
          </AlertDescription>
        </Alert>
      ) : null}

      {verification === "REJECTED" ? (
        <Alert variant="destructive">
          <AlertTitle>Profile rejected</AlertTitle>
          <AlertDescription>{rejectedReason ?? "Ask your college administration for details."}</AlertDescription>
        </Alert>
      ) : null}

      {verification === "ACTIVE" ? (
        <Alert variant="success">
          <AlertTitle>Profile verified</AlertTitle>
          <AlertDescription>Uploads open up in the next slice (S3).</AlertDescription>
        </Alert>
      ) : null}

      <ProfileCard user={user} />

      <Card>
        <CardHeader>
          <CardTitle>Active roles</CardTitle>
          <CardDescription>Roles loaded from the database for this request.</CardDescription>
        </CardHeader>
        <CardContent>
          {user.roles.length === 0 ? (
            <EmptyState title="No special roles" description="You have the standard permissions of your account type." />
          ) : (
            <ul className="flex flex-col gap-2">
              {user.roles.map((role) => (
                <li key={role.id} className="rounded-md border px-3 py-2 text-sm">
                  <span className="font-medium">{titleCase(role.role)}</span>
                  <span className="text-muted-foreground"> · {titleCase(role.scope)}</span>
                  <div className="text-xs text-muted-foreground">
                    {[role.college?.name, role.department?.name, role.session?.name].filter(Boolean).join(" · ") ||
                      "Platform-wide"}
                    {role.expiresAt ? ` · expires ${new Date(role.expiresAt).toLocaleDateString()}` : ""}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default function DashboardPage() {
  return (
    <RequireAuth>
      <DashboardContent />
    </RequireAuth>
  );
}
