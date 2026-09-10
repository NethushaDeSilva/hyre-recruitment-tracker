// Add a candidate to a position — drops them into the Applied stage.
import { useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { Field, Input } from "@/components/ui/Field";
import { Button } from "@/components/ui/Button";
import { addCandidate } from "@/data/store";
import { isEmail, nameFieldError } from "@/lib/validate";

export default function AddCandidateModal({ open, onClose, position }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("");
  const [errors, setErrors] = useState({});

  const reset = () => {
    setName("");
    setEmail("");
    setRole("");
    setErrors({});
  };
  const close = () => {
    reset();
    onClose();
  };
  const submit = async () => {
    // A name that's actually an email (browser autofill cross-filling the
    // adjacent email field is the recurring cause) gets caught here, not
    // after it's already in the pipeline.
    const nameError = nameFieldError(name);
    const emailError = !email.trim() ? "Email address is required." : !isEmail(email) ? "Enter a valid email address." : "";
    if (nameError || emailError) {
      setErrors({ name: nameError, email: emailError });
      return;
    }
    await addCandidate({ name: name.trim(), email: email.trim(), positionId: position.id, appliedRole: role });
    close();
  };

  return (
    <Modal
      open={open}
      onClose={close}
      title="Add candidate"
      subtitle={position ? `Add a new candidate to ${position.title}.` : ""}
      footer={
        <>
          <Button variant="ghost" onClick={close}>Cancel</Button>
          <Button onClick={submit} disabled={!name.trim() || !email.trim()}>Add candidate</Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Full name" error={errors.name}>
          <Input
            value={name}
            onChange={(e) => { setName(e.target.value); setErrors((er) => ({ ...er, name: "" })); }}
            placeholder="e.g. Jordan Lee"
            autoComplete="name"
            autoFocus
          />
        </Field>
        <Field label="Email address" error={errors.email}>
          <Input
            type="email"
            value={email}
            onChange={(e) => { setEmail(e.target.value); setErrors((er) => ({ ...er, email: "" })); }}
            placeholder="name@email.com"
            autoComplete="email"
          />
        </Field>
        <Field label="Applied role">
          <Input value={role} onChange={(e) => setRole(e.target.value)} placeholder="e.g. React Developer" autoComplete="off" />
        </Field>
        <div className="flex items-center gap-2 rounded-md bg-[#EEF1F5] px-3 py-2.5 text-xs font-medium text-[#64748B] dark:bg-white/[0.05] dark:text-[#94A3B8]">
          <span className="h-2 w-2 rounded-full bg-[#64748B]" /> New candidates start in the Applied stage.
        </div>
      </div>
    </Modal>
  );
}
