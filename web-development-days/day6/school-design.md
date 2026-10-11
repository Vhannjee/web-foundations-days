# School Database Design

## Tables

- **students** stores one row per student: `id` (primary key), `name` and `email`. The email is `NOT NULL` and `UNIQUE`, so two students cannot share an address.
- **courses** stores one row per course: `id` (primary key), `title` (unique) and `teacher`.
- **enrolments** stores one row per student-on-course pair: `student_id`, `course_id` and the `grade`. The grade is allowed to be empty (`NULL`) until the course has been marked, and a `CHECK` keeps it between 0 and 100.

## Relationships

- **A student can take many courses, and a course has many students.** This is a **many-to-many** relationship.
- **Why a join table is needed:** a single column cannot hold a list of courses (for example `courses = "Maths,Databases"`), because that cannot be searched, counted or updated properly. Instead, `enrolments` holds one row per pair, with a foreign key to `students` and a foreign key to `courses`.
- **students to enrolments** is **one-to-many**: one student has many enrolment rows, and each row belongs to one student.
- **courses to enrolments** is **one-to-many**: one course has many enrolment rows, and each row belongs to one course.
- Together, those two one-to-many links make the many-to-many relationship between students and courses.
- The primary key of `enrolments` is the pair `(student_id, course_id)`, which stops the same student enrolling on the same course twice. The grade lives here because it belongs to the pair, not to the student or the course alone.
- Both foreign keys use `ON DELETE CASCADE`, so removing a student or a course also removes its enrolments.

## Index

I added `CREATE INDEX idx_enrolments_course ON enrolments(course_id)`.

The primary key `(student_id, course_id)` already makes it fast to find all of one student's enrolments. It does not help when the search starts from the course, for example "all students on Web Foundations" or "number of students per course". Without an index on `course_id`, the database would have to read every enrolment row. As the number of enrolments grows, this index keeps those queries fast, at the small cost of some extra storage and slightly slower inserts.

## SQL or NoSQL?

I would choose SQL (a relational database such as SQLite or PostgreSQL) for this system. The data is naturally structured and linked: students, courses and enrolments all have clear fields and relationships, and a school needs those links to stay correct. SQL enforces that with foreign keys, `UNIQUE` rules and `CHECK` constraints, so nobody can enrol a student who does not exist or enrol the same student twice. It is also very good at the questions a school asks, such as "which students are on this course?" or "how many students are in each course?", using JOINs and GROUP BY. A NoSQL document database could store each student with a list of courses inside, which is simple to read, but it would repeat course details in many documents and make questions from the course side harder. NoSQL would make more sense if the data had no fixed shape, or had to handle huge volumes of loosely structured records, and neither applies here.
