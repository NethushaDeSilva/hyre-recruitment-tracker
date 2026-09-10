# WS6.1 threshold calibration results

Calibrated 2026-09-10T09:26:53.339Z against `@cf/baai/bge-base-en-v1.5`.

## Skills — derived threshold: 0.8786 (max(hardNegatives) — distributions overlapped)

| a | b | category | relation | similarity |
|---|---|---|---|---|
| Relational database management | PostgreSQL | true_match | category_instance | 0.7466 |
| Container orchestration | Kubernetes | true_match | category_instance | 0.7243 |
| Infrastructure as code | Terraform | true_match | category_instance | 0.5969 |
| Distributed version control | Git | true_match | category_instance | 0.7252 |
| Client-side scripting language | JavaScript | true_match | category_instance | 0.7526 |
| Server-side JavaScript runtime | Node.js | true_match | category_instance | 0.6567 |
| In-memory data caching | Redis | true_match | category_instance | 0.5756 |
| Continuous integration pipelines | Jenkins | true_match | category_instance | 0.5928 |
| NoSQL document storage | MongoDB | true_match | category_instance | 0.7635 |
| Deep learning model training | TensorFlow | true_match | category_instance | 0.7280 |
| Cloud compute provisioning | AWS | true_match | category_instance | 0.7053 |
| Building and consuming RESTful APIs | API development | true_match | equivalence | 0.7760 |
| Writing automated test suites | Test automation | true_match | equivalence | 0.8727 |
| Optimizing SQL query performance | Database performance tuning | true_match | equivalence | 0.8481 |
| Troubleshooting production issues | Live system debugging | true_match | equivalence | 0.7360 |
| Python | Java | true_non_match | — | 0.7780 |
| Docker | Figma | true_non_match | — | 0.5642 |
| SQL | HTML | true_non_match | — | 0.7035 |
| Kubernetes | Photoshop | true_non_match | — | 0.5204 |
| React | Excel | true_non_match | — | 0.5936 |
| AWS | Illustrator | true_non_match | — | 0.5686 |
| MongoDB | CSS | true_non_match | — | 0.5870 |
| TensorFlow | InDesign | true_non_match | — | 0.5301 |
| Git | PowerPoint | true_non_match | — | 0.5493 |
| Linux | Salesforce | true_non_match | — | 0.5961 |
| GraphQL | Microsoft Word | true_non_match | — | 0.5429 |
| Jenkins | Canva | true_non_match | — | 0.4601 |
| Redis | Outlook | true_non_match | — | 0.5714 |
| Terraform | Keynote | true_non_match | — | 0.5574 |
| Swift | Bookkeeping | true_non_match | — | 0.5076 |
| Java | JavaScript | hard_negative | — | 0.8096 |
| C | C++ | hard_negative | — | 0.6971 |
| React | React Native | hard_negative | — | 0.7915 |
| C++ | C# | hard_negative | — | 0.7205 |
| Angular | AngularJS | hard_negative | — | 0.8786 |
| Node.js | Deno | hard_negative | — | 0.5518 |
| Vue | Nuxt | hard_negative | — | 0.6723 |
| MySQL | PostgreSQL | hard_negative | — | 0.8133 |
| Docker | Kubernetes | hard_negative | — | 0.7364 |
| Webpack | Vite | hard_negative | — | 0.5550 |
| Redux | MobX | hard_negative | — | 0.5774 |
| Jest | Mocha | hard_negative | — | 0.5524 |
| TensorFlow | PyTorch | hard_negative | — | 0.6942 |
| Swift | Objective-C | hard_negative | — | 0.6769 |
| Kotlin | Java | hard_negative | — | 0.6632 |

- true_match: min 0.5756, max 0.8727 (n=15)
- true_non_match: min 0.4601, max 0.7780 (n=15)
- hard_negative: min 0.5518, max 0.8786 (n=15)
- distributions separated cleanly: false
- false-negative rate on true_match at this threshold: 100.0% (15/15)
- hard-negative false-positive rate at this threshold: 0.0%

## Qualifications — derived threshold: 0.8701 (max(hardNegatives) — distributions overlapped)

| a | b | category | similarity |
|---|---|---|---|
| Computer Science | Software Engineering | true_match | 0.7192 |
| Information Technology | Computing | true_match | 0.7510 |
| Accounting | Accountancy | true_match | 0.8484 |
| Data Science | Data Analytics | true_match | 0.7988 |
| Business Administration | Business Management | true_match | 0.8515 |
| Marketing | Digital Marketing | true_match | 0.8029 |
| Psychology | Behavioural Science | true_match | 0.7288 |
| Nursing | Clinical Nursing | true_match | 0.8340 |
| Biology | Biological Sciences | true_match | 0.8621 |
| Economics | Applied Economics | true_match | 0.7969 |
| Public Health | Community Health | true_match | 0.8195 |
| Mechanical Engineering | Manufacturing Engineering | true_match | 0.8117 |
| Graphic Design | Visual Communication | true_match | 0.7301 |
| Human Resource Management | People Management | true_match | 0.8445 |
| Environmental Science | Environmental Studies | true_match | 0.8763 |
| Computer Science | Fine Arts | true_non_match | 0.5748 |
| Nursing | History | true_non_match | 0.5624 |
| Mechanical Engineering | Music | true_non_match | 0.5342 |
| Law | Biology | true_non_match | 0.6894 |
| Business Administration | Physics | true_non_match | 0.6002 |
| Mathematics | Theatre Studies | true_non_match | 0.5454 |
| Chemistry | Journalism | true_non_match | 0.5753 |
| English Literature | Civil Engineering | true_non_match | 0.4750 |
| Psychology | Electrical Engineering | true_non_match | 0.5796 |
| Fine Arts | Data Science | true_non_match | 0.5456 |
| Agriculture | Philosophy | true_non_match | 0.5503 |
| Physics | Marketing | true_non_match | 0.6193 |
| Nutrition | Graphic Design | true_non_match | 0.6133 |
| Aerospace Engineering | Sociology | true_non_match | 0.5127 |
| Veterinary Science | Political Science | true_non_match | 0.7214 |
| Computer Science | Mathematics | hard_negative | 0.7179 |
| Information Technology | Business Information Systems | hard_negative | 0.7988 |
| Civil Engineering | Mechanical Engineering | hard_negative | 0.7062 |
| Computer Science | Information Technology | hard_negative | 0.7092 |
| Physics | Mathematics | hard_negative | 0.7358 |
| Accounting | Finance | hard_negative | 0.7671 |
| Marketing | Business Administration | hard_negative | 0.6614 |
| Biology | Biomedical Science | hard_negative | 0.8285 |
| Psychology | Sociology | hard_negative | 0.7276 |
| Data Science | Computer Science | hard_negative | 0.7687 |
| Electrical Engineering | Electronic Engineering | hard_negative | 0.8701 |
| Economics | Business Administration | hard_negative | 0.6388 |
| Chemistry | Chemical Engineering | hard_negative | 0.7800 |
| Nursing | Public Health | hard_negative | 0.6325 |
| Law | Criminology | hard_negative | 0.6458 |

- true_match: min 0.7192, max 0.8763 (n=15)
- true_non_match: min 0.4750, max 0.7214 (n=15)
- hard_negative: min 0.6325, max 0.8701 (n=15)
- distributions separated cleanly: false
- false-negative rate on true_match at this threshold: 93.3% (14/15)
- hard-negative false-positive rate at this threshold: 0.0%
