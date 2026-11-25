"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { FormField } from "@/components/form-field";
import { ErrorState, LoadingState } from "@/components/states";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { useCollegeDepartments, useColleges, useDepartmentSessions } from "@/features/academic/hooks";
import { ApiError } from "@/lib/api";
import { useRegister } from "../hooks/use-auth";
import { studentRegisterSchema, type StudentRegisterValues } from "../schemas";

/** S1-F5 — student tab: college → department → session cascading selects. */
export function StudentRegisterForm() {
  const router = useRouter();
  const registerAccount = useRegister();
  const collegesQuery = useColleges();

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<StudentRegisterValues>({
    resolver: zodResolver(studentRegisterSchema),
    defaultValues: {
      name: "",
      email: "",
      password: "",
      collegeId: "",
      departmentId: "",
      sessionId: "",
      regNo: "",
    },
  });

  const collegeId = watch("collegeId");
  const departmentId = watch("departmentId");
  const departmentsQuery = useCollegeDepartments(collegeId);
  const sessionsQuery = useDepartmentSessions(departmentId);

  useEffect(() => {
    setValue("departmentId", "");
    setValue("sessionId", "");
  }, [collegeId, setValue]);

  useEffect(() => {
    setValue("sessionId", "");
  }, [departmentId, setValue]);

  const onSubmit = handleSubmit(async (values) => {
    try {
      await registerAccount.mutateAsync({ role: "STUDENT", ...values });
      toast.success("Account created. Enter the 6-digit code sent to your email.");
      router.push(`/verify-email?email=${encodeURIComponent(values.email)}`);
    } catch (error) {
      if (!(error instanceof ApiError)) {
        toast.error("Something went wrong. Please try again.");
        return;
      }

      if (error.code === "EMAIL_TAKEN") {
        setError("email", { message: error.message });
        return;
      }

      if (error.code === "REG_NO_TAKEN") {
        setError("regNo", { message: error.message });
        return;
      }

      toast.error(error.message);
    }
  });

  return (
    <form className="flex flex-col gap-4" onSubmit={onSubmit} noValidate>
      <FormField id="student-name" label="Full name" error={errors.name?.message}>
        <Input id="student-name" autoComplete="name" {...register("name")} />
      </FormField>

      <FormField id="student-email" label="Email" error={errors.email?.message} hint="Your college email works best.">
        <Input id="student-email" type="email" autoComplete="email" {...register("email")} />
      </FormField>

      <FormField
        id="student-password"
        label="Password"
        error={errors.password?.message}
        hint="At least 8 characters, with a letter and a number."
      >
        <Input id="student-password" type="password" autoComplete="new-password" {...register("password")} />
      </FormField>

      {collegesQuery.isPending ? <LoadingState label="Loading colleges…" /> : null}

      {collegesQuery.isError ? (
        <ErrorState
          title="Could not load colleges"
          description={collegesQuery.error.message}
          onRetry={() => void collegesQuery.refetch()}
        />
      ) : null}

      {collegesQuery.isSuccess ? (
        <FormField id="student-college" label="College" error={errors.collegeId?.message}>
          <Select id="student-college" {...register("collegeId")}>
            <option value="">Select your college</option>
            {collegesQuery.data.map((college) => (
              <option key={college.id} value={college.id}>
                {college.name}
              </option>
            ))}
          </Select>
        </FormField>
      ) : null}

      {collegeId ? (
        <FormField
          id="student-department"
          label="Department"
          error={errors.departmentId?.message}
          hint={departmentsQuery.isPending ? "Loading departments…" : undefined}
        >
          <Select id="student-department" disabled={departmentsQuery.isPending} {...register("departmentId")}>
            <option value="">Select your department</option>
            {(departmentsQuery.data?.departments ?? []).map((department) => (
              <option key={department.id} value={department.id}>
                {department.name}
              </option>
            ))}
          </Select>
        </FormField>
      ) : null}

      {departmentId ? (
        <FormField
          id="student-session"
          label="Session"
          error={errors.sessionId?.message}
          hint={sessionsQuery.isPending ? "Loading sessions…" : undefined}
        >
          <Select id="student-session" disabled={sessionsQuery.isPending} {...register("sessionId")}>
            <option value="">Select your session</option>
            {(sessionsQuery.data?.sessions ?? []).map((session) => (
              <option key={session.id} value={session.id}>
                {session.name}
              </option>
            ))}
          </Select>
        </FormField>
      ) : null}

      <FormField
        id="student-regno"
        label="Registration number"
        error={errors.regNo?.message}
        hint="Unique inside your college."
      >
        <Input id="student-regno" {...register("regNo")} />
      </FormField>

      <Button type="submit" disabled={isSubmitting || registerAccount.isPending}>
        {isSubmitting || registerAccount.isPending ? "Creating account…" : "Create student account"}
      </Button>
    </form>
  );
}
