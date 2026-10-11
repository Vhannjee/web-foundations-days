# Library API Design

A REST API for a library's **books** resource. The resource name is a plural noun (`books`), and the HTTP method says what to do with it. All requests and responses use JSON.

**Base URL:** `https://api.example-library.com`

## Book object

```json
{
  "id": 12,
  "title": "Things Fall Apart",
  "author": "Chinua Achebe",
  "year": 1958,
  "available": true
}
```

## Endpoints

### 1. List all books

- **Method and path:** `GET /books`
- **Description:** Returns every book in the library.
- **Request body:** none
- **Success status:** `200 OK`

### 2. Get one book

- **Method and path:** `GET /books/{id}`
- **Description:** Returns the single book with the given id.
- **Request body:** none
- **Success status:** `200 OK`

### 3. Create a book

- **Method and path:** `POST /books`
- **Description:** Adds a new book; the server assigns the id.
- **Example request body:**

  ```json
  {
    "title": "Things Fall Apart",
    "author": "Chinua Achebe",
    "year": 1958
  }
  ```

- **Success status:** `201 Created`

### 4. Update a book (replace)

- **Method and path:** `PUT /books/{id}`
- **Description:** Replaces all the fields of an existing book.
- **Example request body:**

  ```json
  {
    "title": "Things Fall Apart",
    "author": "Chinua Achebe",
    "year": 1958,
    "available": false
  }
  ```

- **Success status:** `200 OK`

### 5. Update part of a book

- **Method and path:** `PATCH /books/{id}`
- **Description:** Changes only the fields that are sent, for example marking a book as borrowed.
- **Example request body:**

  ```json
  {
    "available": false
  }
  ```

- **Success status:** `200 OK`

### 6. Delete a book

- **Method and path:** `DELETE /books/{id}`
- **Description:** Removes the book from the library.
- **Request body:** none
- **Success status:** `204 No Content` (success, with nothing to send back)

### 7. List books by an author

- **Method and path:** `GET /books?author=Chinua%20Achebe`
- **Description:** Returns only the books written by the author given in the `author` query parameter.
- **Request body:** none
- **Success status:** `200 OK` (an empty list `[]` if the author has no books)

## Summary table

| Action | Method | Path | Success |
| --- | --- | --- | --- |
| List books | GET | `/books` | 200 |
| Get one book | GET | `/books/{id}` | 200 |
| Create | POST | `/books` | 201 |
| Replace | PUT | `/books/{id}` | 200 |
| Partial update | PATCH | `/books/{id}` | 200 |
| Delete | DELETE | `/books/{id}` | 204 |
| List by author | GET | `/books?author=...` | 200 |

## Error codes

### 400 Bad Request

The request is wrong, so the client must fix it before trying again.

- **Example:** `POST /books` with a body that has no `title`, or with `"year": "last year"` instead of a number.
- **Example response body:**

  ```json
  { "error": "title is required" }
  ```

### 404 Not Found

The thing that was asked for does not exist.

- **Example:** `GET /books/9999` when no book has the id 9999. The same applies to `PUT`, `PATCH` and `DELETE` on an id that does not exist.
- **Example response body:**

  ```json
  { "error": "Book 9999 not found" }
  ```
