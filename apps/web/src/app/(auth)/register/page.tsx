"use client";

import Link from "next/link";
import { StudentRegisterForm } from "@/features/auth/components/student-register-form";
import { TeacherRegisterForm } from "@/features/auth/components/teacher-register-form";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export default function RegisterPage() {
  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle>Create your NoteKoi account</CardTitle>
          <CardDescription>
            Students join a college, department and session. Teachers join the departments they teach and are verified
            by the college Sub Admin.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="STUDENT">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="STUDENT">Student</TabsTrigger>
              <TabsTrigger value="TEACHER">Teacher</TabsTrigger>
            </TabsList>
            <TabsContent value="STUDENT">
              <StudentRegisterForm />
            </TabsContent>
            <TabsContent value="TEACHER">
              <TeacherRegisterForm />
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      <p className="text-center text-sm text-muted-foreground">
        Already registered?{" "}
        <Link href="/login" className="font-medium text-foreground underline underline-offset-4">
          Sign in
        </Link>
      </p>
    </div>
  );
}
