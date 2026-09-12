# WS6.1 threshold calibration results

Calibrated 2026-09-10T09:37:37.496Z against `@cf/baai/bge-base-en-v1.5`.

## Skills — PRIMARY (sets SKILL_SIMILARITY_THRESHOLD) — derived threshold: 0.8804 (max(hardNegatives) — distributions overlapped)

| a | b | category | relation | similarity |
|---|---|---|---|---|
| Container orchestration | Kubernetes | true_match | category_instance | 0.7276 |
| Version control | Git | true_match | category_instance | 0.7515 |
| Infrastructure automation | Terraform | true_match | category_instance | 0.6221 |
| Data caching | Redis | true_match | category_instance | 0.5910 |
| Build automation | Jenkins | true_match | category_instance | 0.6573 |
| Document database | MongoDB | true_match | category_instance | 0.8046 |
| Deep learning | TensorFlow | true_match | category_instance | 0.7829 |
| Cloud hosting | AWS | true_match | category_instance | 0.7183 |
| Frontend framework | React | true_match | category_instance | 0.6751 |
| Backend runtime | Node.js | true_match | category_instance | 0.6595 |
| Load balancing | Nginx | true_match | category_instance | 0.6719 |
| Client-side | Frontend | true_match | equivalence | 0.7337 |
| Server-side | Backend | true_match | equivalence | 0.7344 |
| Testing | Quality assurance | true_match | equivalence | 0.7049 |
| Bug fixing | Debugging | true_match | equivalence | 0.7530 |
| Python | Java | true_non_match | — | 0.7681 |
| Docker | Figma | true_non_match | — | 0.5619 |
| SQL | HTML | true_non_match | — | 0.6934 |
| Kubernetes | Photoshop | true_non_match | — | 0.5069 |
| React | Excel | true_non_match | — | 0.5869 |
| AWS | Illustrator | true_non_match | — | 0.5565 |
| MongoDB | CSS | true_non_match | — | 0.5673 |
| TensorFlow | InDesign | true_non_match | — | 0.5204 |
| Git | PowerPoint | true_non_match | — | 0.5373 |
| Linux | Salesforce | true_non_match | — | 0.5851 |
| GraphQL | Microsoft Word | true_non_match | — | 0.5399 |
| Jenkins | Canva | true_non_match | — | 0.4603 |
| Redis | Outlook | true_non_match | — | 0.5694 |
| Terraform | Keynote | true_non_match | — | 0.5569 |
| Swift | Bookkeeping | true_non_match | — | 0.5094 |
| Java | JavaScript | hard_negative | — | 0.8022 |
| C | C++ | hard_negative | — | 0.7009 |
| React | React Native | hard_negative | — | 0.7958 |
| C++ | C# | hard_negative | — | 0.7253 |
| Angular | AngularJS | hard_negative | — | 0.8804 |
| Node.js | Deno | hard_negative | — | 0.5432 |
| Vue | Nuxt | hard_negative | — | 0.6751 |
| MySQL | PostgreSQL | hard_negative | — | 0.8099 |
| Docker | Kubernetes | hard_negative | — | 0.7259 |
| Webpack | Vite | hard_negative | — | 0.5572 |
| Redux | MobX | hard_negative | — | 0.5801 |
| Jest | Mocha | hard_negative | — | 0.5544 |
| TensorFlow | PyTorch | hard_negative | — | 0.7052 |
| Swift | Objective-C | hard_negative | — | 0.6791 |
| Kotlin | Java | hard_negative | — | 0.6833 |

- true_match: min 0.5910, max 0.8046 (n=15)
- true_non_match: min 0.4603, max 0.7681 (n=15)
- hard_negative: min 0.5432, max 0.8804 (n=15)
- distributions separated cleanly: false
- false-negative rate on true_match at this threshold: 100.0% (15/15)
- hard-negative false-positive rate at this threshold: 0.0%

## Skills — secondary, informational only (does not set the threshold)

Scored against the PRIMARY threshold 0.8804. Clearing or missing it here changes nothing at runtime — this table exists to show what happens when a vacancy states a general capability and a CV names a specific tool, which the primary keyword-vs-keyword set above does not cover.

| a (general capability) | b (named tool) | relation | similarity | clears primary threshold |
|---|---|---|---|---|
| Relational database management | PostgreSQL | category_instance | 0.7402 | no |
| Container orchestration | Kubernetes | category_instance | 0.7276 | no |
| Infrastructure as code | Terraform | category_instance | 0.6000 | no |
| Distributed version control | Git | category_instance | 0.7260 | no |
| Client-side scripting language | JavaScript | category_instance | 0.7603 | no |
| Server-side JavaScript runtime | Node.js | category_instance | 0.6576 | no |
| In-memory data caching | Redis | category_instance | 0.5808 | no |
| Continuous integration pipelines | Jenkins | category_instance | 0.6014 | no |
| NoSQL document storage | MongoDB | category_instance | 0.7673 | no |
| Deep learning model training | TensorFlow | category_instance | 0.7384 | no |
| Cloud compute provisioning | AWS | category_instance | 0.7111 | no |
| Building and consuming RESTful APIs | API development | equivalence | 0.7761 | no |
| Writing automated test suites | Test automation | equivalence | 0.8727 | no |
| Optimizing SQL query performance | Database performance tuning | equivalence | 0.8481 | no |
| Troubleshooting production issues | Live system debugging | equivalence | 0.7361 | no |

- 0/15 clear the primary threshold

## Qualifications — derived threshold: 0.8782 (max(hardNegatives) — distributions overlapped)

| a | b | category | similarity |
|---|---|---|---|
| Computer Science | Software Engineering | true_match | 0.7223 |
| Information Technology | Computing | true_match | 0.7513 |
| Accounting | Accountancy | true_match | 0.8484 |
| Data Science | Data Analytics | true_match | 0.7981 |
| Business Administration | Business Management | true_match | 0.8520 |
| Marketing | Digital Marketing | true_match | 0.8067 |
| Psychology | Behavioural Science | true_match | 0.7319 |
| Nursing | Clinical Nursing | true_match | 0.8360 |
| Biology | Biological Sciences | true_match | 0.8637 |
| Economics | Applied Economics | true_match | 0.7988 |
| Public Health | Community Health | true_match | 0.8204 |
| Mechanical Engineering | Manufacturing Engineering | true_match | 0.8119 |
| Graphic Design | Visual Communication | true_match | 0.7286 |
| Human Resource Management | People Management | true_match | 0.8446 |
| Environmental Science | Environmental Studies | true_match | 0.8760 |
| Computer Science | Fine Arts | true_non_match | 0.5780 |
| Nursing | History | true_non_match | 0.5682 |
| Mechanical Engineering | Music | true_non_match | 0.5354 |
| Law | Biology | true_non_match | 0.6976 |
| Business Administration | Physics | true_non_match | 0.6077 |
| Mathematics | Theatre Studies | true_non_match | 0.5582 |
| Chemistry | Journalism | true_non_match | 0.5923 |
| English Literature | Civil Engineering | true_non_match | 0.4847 |
| Psychology | Electrical Engineering | true_non_match | 0.5964 |
| Fine Arts | Data Science | true_non_match | 0.5456 |
| Agriculture | Philosophy | true_non_match | 0.5627 |
| Physics | Marketing | true_non_match | 0.6301 |
| Nutrition | Graphic Design | true_non_match | 0.6178 |
| Aerospace Engineering | Sociology | true_non_match | 0.5396 |
| Veterinary Science | Political Science | true_non_match | 0.7345 |
| Computer Science | Mathematics | hard_negative | 0.7214 |
| Information Technology | Business Information Systems | hard_negative | 0.8044 |
| Civil Engineering | Mechanical Engineering | hard_negative | 0.7205 |
| Computer Science | Information Technology | hard_negative | 0.7132 |
| Physics | Mathematics | hard_negative | 0.7584 |
| Accounting | Finance | hard_negative | 0.7722 |
| Marketing | Business Administration | hard_negative | 0.6651 |
| Biology | Biomedical Science | hard_negative | 0.8438 |
| Psychology | Sociology | hard_negative | 0.7359 |
| Data Science | Computer Science | hard_negative | 0.7708 |
| Electrical Engineering | Electronic Engineering | hard_negative | 0.8782 |
| Economics | Business Administration | hard_negative | 0.6432 |
| Chemistry | Chemical Engineering | hard_negative | 0.7868 |
| Nursing | Public Health | hard_negative | 0.6389 |
| Law | Criminology | hard_negative | 0.6713 |

- true_match: min 0.7223, max 0.8760 (n=15)
- true_non_match: min 0.4847, max 0.7345 (n=15)
- hard_negative: min 0.6389, max 0.8782 (n=15)
- distributions separated cleanly: false
- false-negative rate on true_match at this threshold: 100.0% (15/15)
- hard-negative false-positive rate at this threshold: 0.0%
