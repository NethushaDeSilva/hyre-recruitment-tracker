# Verification: can a public visitor self-register as staff?

Answer: no. Confirmed across three independent layers — client UI, client
code path, and the Firestore security rule. Any one of the three would stop
it alone; all three agree.

## 1. Firestore rule (the actual enforcement boundary)

`firestore.rules`, `users/{uid}` create:

```
allow create: if signedIn() && request.auth.uid == uid
              && request.resource.data.role == 'Candidate';
```

A `users/{uid}` document can only ever be self-created with `role: 'Candidate'`.
No client-side code, and no request body, can make this write succeed with
any other role — the database rejects it outright regardless of what the
client sends.

Role is also immutable after creation:

```
allow update: if signedIn() && request.auth.uid == uid
              && request.resource.data.role == resource.data.role
```

A signed-in user can never change their own stored role via any client write.

## 2. Client code path (`src/context/AuthContext.jsx`, `register()`)

```js
const register = async ({ name, email, password, remember = true }) => { ... }
```

No `role` parameter exists in the signature or anywhere in the function body.
Registration creates the Firebase Auth user and sets the display name on the
**Auth profile only** — it does not write a `users/{uid}` Firestore document
at all. Candidates are never stored in the staff-only `users` collection in
the first place, so there is no code path where a request body's role could
even be attempted.

## 3. Signup form (`src/pages/Login.jsx`)

The registration form collects name, email, and password only. There is no
role field, selector, or hidden input anywhere in the form — a role was never
offered as a signup-time choice in the UI.

## Conclusion

A public visitor can only ever create a Candidate account:
- the UI never asks for a role,
- the client code never sends one,
- and even if both of those were bypassed (a hand-crafted request), the
  Firestore rule rejects any `users/{uid}` create that isn't `role: 'Candidate'`.

Verified 2026-09-16 against the current `firestore.rules`, `AuthContext.jsx`,
and `Login.jsx`. No change was made — this documents that the existing
implementation is already correct.
