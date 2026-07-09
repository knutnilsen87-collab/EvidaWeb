
Repo Health Checklist

Use before and after each patch.

Placement
 Is the code in the owning module/package?
 Did we extend existing owned modules before creating new ones?
 Did we avoid generic helpers/misc files?
Ownership
 Readiness logic lives only in readiness domain.
 Parser/OCR workers do not decide usage mode.
 UI does not infer legal readiness from raw processing fields.
 Retrieval guard, not prompt, enforces source usage.
Contracts
 Canonical enums are reused.
 No duplicate private readiness statuses.
 API/event payloads follow contract docs.
 Breaking changes are avoided or explicitly versioned.
Duplication
 No duplicate status mapping logic spread across components.
 No duplicated evaluator rules.
 No parallel source-readiness models.
Coupling
 Readiness evaluator has no database dependency.
 Controllers do not compute readiness.
 LLM prompt does not own safety logic.
 Event layer depends on readiness, not vice versa.
Cleanup
 Obsolete temporary code removed.
 Dead status branches removed.
 Test fixtures are named clearly.
 No debug logs or technical codes leak to lawyer UI.
Verdict

After the patch, choose one:

repo health: improved
repo health: preserved
repo health: degraded

If degraded, do not claim clean success. Either fix now or explicitly document containment and follow-up.
