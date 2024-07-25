---
---

window.signatories = {{ site.data.signatories | group_by: "signatory" | jsonify }};
