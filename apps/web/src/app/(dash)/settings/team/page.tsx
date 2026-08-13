"use client";

import { useEffect, useState } from "react";
import { PERMISSIONS, PERMISSION_LABELS, ROLES, type Permission, type Role } from "@codeforge/shared";
import { staffApi, ApiError } from "@/lib/api";
import { Badge, Button, Card, ErrorNote, Field, Input, Select, Spinner } from "@/components/ui";
import { Table, Thead, Tbody, Th, Tr, Td } from "@/components/Table";
import { Modal } from "@/components/Modal";
import { titleCase, fmtDateTime } from "@/lib/format";

interface TeamMember {
  id: string;
  name: string;
  email: string;
  role: Role;
  permissions: Permission[];
  isActive: boolean;
  createdAt: string;
}

const EMPTY_FORM = {
  name: "",
  email: "",
  password: "",
  role: "recruiter" as Role,
  permissions: [] as Permission[],
};

export default function TeamPage() {
  const [members, setMembers] = useState<TeamMember[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [editing, setEditing] = useState<TeamMember | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function reload() {
    try {
      const d = await staffApi<{ users: TeamMember[] }>("/api/users");
      setMembers(d.users);
      setLoadError(null);
    } catch (err) {
      setLoadError(err instanceof ApiError ? err.message : "Could not load the team");
    }
  }

  useEffect(() => {
    void reload();
  }, []);

  function openCreate() {
    setForm(EMPTY_FORM);
    setError(null);
    setCreating(true);
  }

  function openEdit(m: TeamMember) {
    setForm({ name: m.name, email: m.email, password: "", role: m.role, permissions: m.permissions });
    setError(null);
    setEditing(m);
  }

  function togglePermission(p: Permission) {
    setForm((f) => ({
      ...f,
      permissions: f.permissions.includes(p) ? f.permissions.filter((x) => x !== p) : [...f.permissions, p],
    }));
  }

  async function submitCreate() {
    setBusy(true);
    setError(null);
    try {
      await staffApi("/api/users", {
        method: "POST",
        body: { name: form.name, email: form.email, password: form.password, role: form.role, permissions: form.permissions },
      });
      setCreating(false);
      await reload();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not create the account");
    } finally {
      setBusy(false);
    }
  }

  async function submitEdit() {
    if (!editing) return;
    setBusy(true);
    setError(null);
    try {
      await staffApi(`/api/users/${editing.id}`, {
        method: "PUT",
        body: { name: form.name, role: form.role, permissions: form.permissions },
      });
      setEditing(null);
      await reload();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not update the account");
    } finally {
      setBusy(false);
    }
  }

  async function toggleActive(m: TeamMember) {
    try {
      await staffApi(`/api/users/${m.id}`, { method: "PUT", body: { isActive: !m.isActive } });
      await reload();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not update the account");
    }
  }

  if (!members) return loadError ? <ErrorNote message={loadError} /> : <Spinner />;

  const permissionFields = (
    <div>
      <span className="mb-1.5 block text-xs font-medium text-on-surface-variant">
        Permissions (leave all unchecked for full access within the role)
      </span>
      <div className="grid grid-cols-2 gap-2">
        {PERMISSIONS.map((p) => (
          <label key={p} className="flex items-center gap-2 rounded-md bg-surface-container px-2.5 py-1.5 text-sm">
            <input
              type="checkbox"
              checked={form.permissions.includes(p)}
              onChange={() => togglePermission(p)}
              className="accent-accent"
            />
            {PERMISSION_LABELS[p]}
          </label>
        ))}
      </div>
    </div>
  );

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-headline-md text-on-surface">Team</h1>
          <p className="mt-1 text-sm text-on-surface-variant">
            Staff accounts for this org. Scope an employee to specific permissions, or leave them
            unchecked for full access within their role.
          </p>
        </div>
        <Button onClick={openCreate}>Add team member</Button>
      </div>

      {error && !creating && !editing ? <ErrorNote message={error} /> : null}

      <Card>
        <Table>
          <Thead>
            <tr>
              <Th className="pl-5">Name</Th>
              <Th>Role</Th>
              <Th>Permissions</Th>
              <Th>Status</Th>
              <Th>Joined</Th>
              <Th className="pr-5" />
            </tr>
          </Thead>
          <Tbody>
            {members.map((m) => (
              <Tr key={m.id}>
                <Td className="pl-5">
                  <div className="font-medium">{m.name}</div>
                  <div className="text-xs text-on-surface-variant">{m.email}</div>
                </Td>
                <Td>{titleCase(m.role)}</Td>
                <Td>
                  {m.permissions.length === 0 ? (
                    <span className="text-xs text-on-surface-variant">Full access</span>
                  ) : (
                    <div className="flex flex-wrap gap-1">
                      {m.permissions.map((p) => (
                        <Badge key={p} color="accent">
                          {PERMISSION_LABELS[p]}
                        </Badge>
                      ))}
                    </div>
                  )}
                </Td>
                <Td>
                  <Badge color={m.isActive ? "ok" : "bad"} icon={m.isActive ? "pass" : "fail"}>
                    {m.isActive ? "Active" : "Deactivated"}
                  </Badge>
                </Td>
                <Td className="text-on-surface-variant">{fmtDateTime(m.createdAt)}</Td>
                <Td className="pr-5 text-right">
                  <div className="flex justify-end gap-3">
                    <button onClick={() => openEdit(m)} className="text-xs font-medium text-accent hover:underline">
                      Edit
                    </button>
                    <button
                      onClick={() => void toggleActive(m)}
                      className="text-xs font-medium text-on-surface-variant hover:text-rose-600"
                    >
                      {m.isActive ? "Deactivate" : "Reactivate"}
                    </button>
                  </div>
                </Td>
              </Tr>
            ))}
          </Tbody>
        </Table>
      </Card>

      <Modal open={creating} onClose={() => setCreating(false)} title="Add team member">
        <div className="space-y-4">
          {error ? <ErrorNote message={error} /> : null}
          <Field label="Name">
            <Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
          </Field>
          <Field label="Email">
            <Input
              type="email"
              value={form.email}
              onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
            />
          </Field>
          <Field label="Temporary password" hint="At least 8 characters. Share it with them directly.">
            <Input
              type="password"
              value={form.password}
              onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
            />
          </Field>
          <Field label="Role">
            <Select value={form.role} onChange={(e) => setForm((f) => ({ ...f, role: e.target.value as Role }))}>
              {ROLES.map((r) => (
                <option key={r} value={r}>
                  {titleCase(r)}
                </option>
              ))}
            </Select>
          </Field>
          {permissionFields}
          <Button className="w-full" disabled={busy} onClick={() => void submitCreate()}>
            {busy ? "Creating…" : "Create account"}
          </Button>
        </div>
      </Modal>

      <Modal open={Boolean(editing)} onClose={() => setEditing(null)} title="Edit team member">
        <div className="space-y-4">
          {error ? <ErrorNote message={error} /> : null}
          <Field label="Name">
            <Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
          </Field>
          <Field label="Email" hint="Email cannot be changed here.">
            <Input value={form.email} disabled />
          </Field>
          <Field label="Role">
            <Select value={form.role} onChange={(e) => setForm((f) => ({ ...f, role: e.target.value as Role }))}>
              {ROLES.map((r) => (
                <option key={r} value={r}>
                  {titleCase(r)}
                </option>
              ))}
            </Select>
          </Field>
          {permissionFields}
          <Button className="w-full" disabled={busy} onClick={() => void submitEdit()}>
            {busy ? "Saving…" : "Save changes"}
          </Button>
        </div>
      </Modal>
    </div>
  );
}
