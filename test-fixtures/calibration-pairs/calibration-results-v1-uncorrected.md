# WS6.1 threshold calibration results

Calibrated 2026-09-10T09:01:06.733Z against `@cf/baai/bge-base-en-v1.5`.

## Skills — derived threshold: 0.8786 (max(hardNegatives) — distributions overlapped)

| a | b | category | similarity |
|---|---|---|---|
| React.js | React | true_match | 0.8962 |
| PostgreSQL | Postgres | true_match | 0.9320 |
| AWS | Amazon Web Services | true_match | 0.8022 |
| Node.js | Node | true_match | 0.7916 |
| JavaScript | JS | true_match | 0.8348 |
| TypeScript | TS | true_match | 0.7517 |
| Kubernetes | K8s | true_match | 0.6974 |
| Continuous Integration | CI | true_match | 0.6620 |
| MongoDB | Mongo | true_match | 0.7895 |
| Python 3 | Python | true_match | 0.8736 |
| Machine Learning | ML | true_match | 0.7323 |
| User Interface Design | UI Design | true_match | 0.9195 |
| User Experience Design | UX Design | true_match | 0.8536 |
| Representational State Transfer | REST API | true_match | 0.5348 |
| Amazon Elastic Compute Cloud | EC2 | true_match | 0.6471 |
| Python | Java | true_non_match | 0.7718 |
| Docker | Figma | true_non_match | 0.5630 |
| SQL | HTML | true_non_match | 0.6974 |
| Kubernetes | Photoshop | true_non_match | 0.5122 |
| React | Excel | true_non_match | 0.5890 |
| AWS | Illustrator | true_non_match | 0.5614 |
| MongoDB | CSS | true_non_match | 0.5752 |
| TensorFlow | InDesign | true_non_match | 0.5238 |
| Git | PowerPoint | true_non_match | 0.5418 |
| Linux | Salesforce | true_non_match | 0.5888 |
| GraphQL | Microsoft Word | true_non_match | 0.5412 |
| Jenkins | Canva | true_non_match | 0.4595 |
| Redis | Outlook | true_non_match | 0.5712 |
| Terraform | Keynote | true_non_match | 0.5569 |
| Swift | Bookkeeping | true_non_match | 0.5076 |
| Java | JavaScript | hard_negative | 0.8031 |
| C | C++ | hard_negative | 0.6971 |
| React | React Native | hard_negative | 0.7938 |
| C++ | C# | hard_negative | 0.7205 |
| Angular | AngularJS | hard_negative | 0.8786 |
| Node.js | Deno | hard_negative | 0.5506 |
| Vue | Nuxt | hard_negative | 0.6723 |
| MySQL | PostgreSQL | hard_negative | 0.8104 |
| Docker | Kubernetes | hard_negative | 0.7308 |
| Webpack | Vite | hard_negative | 0.5550 |
| Redux | MobX | hard_negative | 0.5774 |
| Jest | Mocha | hard_negative | 0.5524 |
| TensorFlow | PyTorch | hard_negative | 0.7006 |
| Swift | Objective-C | hard_negative | 0.6769 |
| Kotlin | Java | hard_negative | 0.6699 |

- true_match: min 0.5348, max 0.9320 (n=15)
- true_non_match: min 0.4595, max 0.7718 (n=15)
- hard_negative: min 0.5506, max 0.8786 (n=15)
- distributions separated cleanly: false
- false-negative rate on true_match at this threshold: 80.0% (12/15)
- hard-negative false-positive rate at this threshold: 6.7%

## Qualifications — derived threshold: 0.9056 (max(hardNegatives) — distributions overlapped)

| a | b | category | similarity |
|---|---|---|---|
| BSc Computer Science | BEng Software Engineering | true_match | 0.6847 |
| BSc Information Technology | BSc Computing | true_match | 0.8652 |
| BEng Electrical Engineering | BSc Electrical Engineering | true_match | 0.8480 |
| MSc Computer Science | MEng Computer Science | true_match | 0.7565 |
| BSc Business Administration | BBA | true_match | 0.8025 |
| MBA | Master of Business Administration | true_match | 0.8101 |
| BSc Accounting | BSc Accountancy | true_match | 0.9432 |
| BA Economics | BSc Economics | true_match | 0.8959 |
| BEng Civil Engineering | BSc Civil Engineering | true_match | 0.8286 |
| BSc Software Engineering | BEng Software Engineering | true_match | 0.8141 |
| MSc Data Science | MSc Data Analytics | true_match | 0.9021 |
| BSc Nursing | Bachelor of Nursing | true_match | 0.8908 |
| LLB | Bachelor of Laws | true_match | 0.8073 |
| BSc Psychology | BA Psychology | true_match | 0.8776 |
| PhD Computer Science | Doctor of Philosophy in Computer Science | true_match | 0.8886 |
| BSc Computer Science | BA Fine Arts | true_non_match | 0.6084 |
| BSc Nursing | BA History | true_non_match | 0.6478 |
| BEng Mechanical Engineering | BA Music | true_non_match | 0.6249 |
| LLB | BSc Biology | true_non_match | 0.6823 |
| MBA | MSc Physics | true_non_match | 0.6275 |
| BSc Mathematics | BA Theatre Studies | true_non_match | 0.6456 |
| BSc Chemistry | BA Journalism | true_non_match | 0.6844 |
| BA English Literature | BSc Civil Engineering | true_non_match | 0.6363 |
| BSc Psychology | BEng Electrical Engineering | true_non_match | 0.5936 |
| BA Fine Arts | BSc Data Science | true_non_match | 0.6278 |
| BSc Agriculture | BA Philosophy | true_non_match | 0.6515 |
| MSc Physics | MBA Marketing | true_non_match | 0.5553 |
| BSc Nutrition | BA Graphic Design | true_non_match | 0.6733 |
| BEng Aerospace Engineering | BA Sociology | true_non_match | 0.5346 |
| BSc Veterinary Science | BA Political Science | true_non_match | 0.6812 |
| BSc Computer Science | BSc Mathematics | hard_negative | 0.8124 |
| BSc IT | BSc Business Information Systems | hard_negative | 0.8902 |
| BEng Civil Engineering | BEng Mechanical Engineering | hard_negative | 0.8707 |
| BSc Computer Science | BSc Information Technology | hard_negative | 0.8496 |
| BSc Physics | BSc Mathematics | hard_negative | 0.8055 |
| BSc Accounting | BSc Finance | hard_negative | 0.8550 |
| BSc Marketing | BSc Business Administration | hard_negative | 0.8036 |
| BSc Biology | BSc Biomedical Science | hard_negative | 0.9056 |
| BSc Software Engineering | BSc Computer Science | hard_negative | 0.8667 |
| MSc Data Science | MSc Computer Science | hard_negative | 0.8612 |
| BSc Electrical Engineering | BSc Electronic Engineering | hard_negative | 0.8960 |
| BA Economics | BSc Business Administration | hard_negative | 0.7213 |
| BSc Chemistry | BSc Chemical Engineering | hard_negative | 0.8740 |
| BSc Nursing | BSc Public Health | hard_negative | 0.8041 |
| LLB | BSc Criminology | hard_negative | 0.6307 |

- true_match: min 0.6847, max 0.9432 (n=15)
- true_non_match: min 0.5346, max 0.6844 (n=15)
- hard_negative: min 0.6307, max 0.9056 (n=15)
- distributions separated cleanly: false
- false-negative rate on true_match at this threshold: 93.3% (14/15)
- hard-negative false-positive rate at this threshold: 6.7%
