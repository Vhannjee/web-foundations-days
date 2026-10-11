-- School database (SQLite)
PRAGMA foreign_keys = ON;

-- Start fresh so the script can be run again (enrolments first: it depends on the others)
DROP TABLE IF EXISTS enrolments;
DROP TABLE IF EXISTS courses;
DROP TABLE IF EXISTS students;

-- ---------- Tables ----------
CREATE TABLE students (
  id     INTEGER PRIMARY KEY,
  name   TEXT NOT NULL,
  email  TEXT NOT NULL UNIQUE
);

CREATE TABLE courses (
  id       INTEGER PRIMARY KEY,
  title    TEXT NOT NULL UNIQUE,
  teacher  TEXT NOT NULL
);

-- One row = one student enrolled on one course (a many-to-many join table that also holds the grade)
CREATE TABLE enrolments (
  student_id  INTEGER NOT NULL,
  course_id   INTEGER NOT NULL,
  grade       INTEGER CHECK (grade BETWEEN 0 AND 100),   -- NULL until the course is graded
  PRIMARY KEY (student_id, course_id),                   -- the same student cannot enrol on the same course twice
  FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE,
  FOREIGN KEY (course_id)  REFERENCES courses(id)  ON DELETE CASCADE
);

-- Speeds up "which students are on this course?" (the primary key already covers lookups by student)
CREATE INDEX idx_enrolments_course ON enrolments(course_id);

-- ---------- Sample data ----------
INSERT INTO students (id, name, email) VALUES
  (1, 'Amina', 'amina@school.example'),
  (2, 'Ben',   'ben@school.example'),
  (3, 'Chidi', 'chidi@school.example'),
  (4, 'Dana',  'dana@school.example');       -- Dana is not enrolled anywhere yet

INSERT INTO courses (id, title, teacher) VALUES
  (1, 'Web Foundations', 'Ms Okafor'),
  (2, 'Databases',       'Mr Dlamini'),
  (3, 'Mathematics',     'Mrs Patel'),
  (4, 'History',         'Mr Evans');        -- nobody has joined History yet

INSERT INTO enrolments (student_id, course_id, grade) VALUES
  (1, 1, 92),
  (1, 2, 85),
  (2, 1, 74),
  (2, 2, NULL),
  (2, 3, 68),
  (3, 1, NULL),
  (3, 3, 80);

-- ---------- Queries ----------

-- 1. All courses for one student (by name)
SELECT courses.title, courses.teacher, enrolments.grade
FROM students
JOIN enrolments ON enrolments.student_id = students.id
JOIN courses    ON courses.id = enrolments.course_id
WHERE students.name = 'Amina'
ORDER BY courses.title;

-- 2. All students on one course
SELECT students.name, students.email, enrolments.grade
FROM courses
JOIN enrolments ON enrolments.course_id = courses.id
JOIN students   ON students.id = enrolments.student_id
WHERE courses.title = 'Web Foundations'
ORDER BY students.name;

-- 3. Number of students per course (LEFT JOIN keeps courses with zero students)
SELECT courses.title, COUNT(enrolments.student_id) AS student_count
FROM courses
LEFT JOIN enrolments ON enrolments.course_id = courses.id
GROUP BY courses.id
ORDER BY student_count DESC, courses.title;

-- 4. Students who have no enrolments
SELECT students.name, students.email
FROM students
LEFT JOIN enrolments ON enrolments.student_id = students.id
WHERE enrolments.student_id IS NULL;

-- 5. Update one enrolment's grade: Ben's grade in Databases becomes 88
UPDATE enrolments
SET grade = 88
WHERE student_id = (SELECT id FROM students WHERE name = 'Ben')
  AND course_id  = (SELECT id FROM courses  WHERE title = 'Databases');

-- Check the update worked
SELECT students.name, courses.title, enrolments.grade
FROM enrolments
JOIN students ON students.id = enrolments.student_id
JOIN courses  ON courses.id = enrolments.course_id
WHERE students.name = 'Ben' AND courses.title = 'Databases';
