"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { FormField } from "@/components/form-field";
import { EmptyState, ErrorState, LoadingState } from "@/components/states";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { useCollegeDepartments, useColleges } from "@/features/academic/hooks";
import { ApiError } from "@/lib/api";
import { useRegister } from "../hooks/use-auth";
import { teacherRegisterSchema, type TeacherRegisterValues } from "../schemas";

/** S1-F5 — teacher tab: one college, one or more departments it has adopted (Q6). */
export function TeacherRegisterForm() {
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
  } = useForm<TeacherRegisterValues>({
    resolver: zodResolver(teacherRegisterSchema),
    defaultValues: { name: "", email: "", password: "", collegeId: "", departmentIds: [] },
  });

  const collegeId = watch("collegeId");
  const selectedDepartments = watch("departmentIds");
  const departmentsQuery = useCollegeDepartments(collegeId);

  useEffect(() => {
    setValue("departmentIds", []);
  }, [collegeId, setValue]);

  const toggleDepartment = (departmentId: string): void => {
    const next = selectedDepartments.includes(departmentId)
      ? selectedDepartments.filter((id) => id !== departmentId)
      : [...selectedDepartments, departmentId];

    setValue("departmentIds", next, { shouldValidate: true });
  };

  const onSubmit = handleSubmit(async (values) => {
    try {
      await registerAccount.mutateAsync({ role: "TEACHER", ...values });
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

      toast.error(error.message);
    }
  });

  return (
    <form className="flex flex-col gap-4" onSubmit={onSubmit} noValidate>
      <FormField id="teacher-name" label="Full name" error={errors.name?.message}>
        <Input id="teacher-name" autoComplete="name" {...register("name")} />
      </FormField>

      <FormField id="teacher-email" label="Email" error={errors.email?.message}>
        <Input id="teacher-email" type="email" autoComplete="email" {...register("email")} />
      </FormField>

      <FormField
        id="teacher-password"
        label="Password"
        error={errors.password?.message}
        hint="At least 8 characters, with a letter and a number."
      >
        <Input id="teacher-password" type="password" autoComplete="new-password" {...register("password")} />
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
        <FormField id="teacher-college" label="College" error={errors.collegeId?.message}>
          <Select id="teacher-college" {...register("collegeId")}>
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
        <div className="flex flex-col gap-2">
          <p className="text-sm font-medium">Departments you teach</p>

          {departmentsQuery.isPending ? <LoadingState label="Loading departments…" /> : null}

          {departmentsQuery.isError ? (
            <ErrorState
              title="Could not load departments"
              description={departmentsQuery.error.message}
              onRetry={() => void departmentsQuery.refetch()}
            />
          ) : null}

          {departmentsQuery.isSuccess && departmentsQuery.data.departments.length === 0 ? (
            <EmptyState
              title="This college has not adopted any department yet"
              description="Ask the platform admin to adopt a department before registering."
            />
          ) : null}

          <div className="flex flex-col gap-2">
            {(departmentsQuery.data?.departments ?? []).map((department) => (
              <label
                key={department.id}
                className="flex cursor-pointer items-center gap-3 rounded-md border px-3 py-2 text-sm hover:bg-accent"
              >
                <input
                  type="checkbox"
                  className="size-4 accent-[hsl(var(--primary))]"
                  checked={selectedDepartments.includes(department.id)}
                  onChange={() => toggleDepartment(department.id)}
                />
                {department.name}
              </label>
            ))}
          </div>

          {errors.departmentIds?.message ? (
            <p className="text-sm font-medium text-destructive">{errors.departmentIds.message}</p>
          ) : null}
        </div>
      ) : null}

      <Button type="submit" disabled={isSubmitting || registerAccount.isPending}>
        {isSubmitting || registerAccount.isPending ? "Creating account…" : "Create teacher account"}
      </Button>
    </form>
  );
}
