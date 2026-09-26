# Optional CDR adapters

No CDR is required or contacted by the core. `src/Adapters/Cdr/CdrAdapter.php` defines the extension boundary (see the source for its exact methods). No EHRbase, Better or other CDR adapter is implemented. No CDR credential variables are currently read.

A future adapter must separate read-only AQL validation/execution from state-changing template/composition deployment, use explicit deployment configuration and authentication, and return execution provenance. The core must still start with that adapter absent. AQL design/review prompts and examples remain usable offline; execution is NOT_EXECUTED without an adapter. Never substitute an invented result for a query that was not run. The model repository is not a patient-data store.
