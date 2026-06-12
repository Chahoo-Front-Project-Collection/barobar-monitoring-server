# Barobar Monitoring Server

Barobar 서비스의 프론트엔드 에러와 **rrweb 세션 리플레이**를 `수집·저장`하고,
모니터링 대시보드 웹에서 `조회` API를 제공하는 백엔드입니다.

- 실서비스 FE에서 보낸 500 에러 이벤트를 해당 서버에서 저장.
- 리플레이 페이로드는 gzip 파일로 보관.
- 수집된 데이터는 모니터링 대시보드 웹에서 조회.

> Sentry 같은 외부 통합 SaaS에 의존하지 않고, "세션 리플레이"라는 핵심 기능만 자체 호스팅으로 가볍게 운영하는 것을 목표로 합니다.

## Quick Start

### 요구사항

- **Node.js** 20+
- **pnpm**
- **PostgreSQL** 16 (로컬 설치 또는 아래 Docker Compose 사용)

### 환경 변수

`.env.example`를 복사해 `.env`를 만들고, 로컬 값으로 바꿉니다.

```bash
DATABASE_URL="postgresql://barobar:barobar@localhost:5432/barobar_monitoring"
```

`PORT`는 기본값 `4000`, `STORAGE_PATH`는 기본값 `./storage`를 사용합니다.

### 명령어

```bash
pnpm install                       # 의존성 설치
docker compose up -d               # PostgreSQL 16 컨테이너 실행
pnpm prisma migrate dev            # 마이그레이션 적용 + Prisma Client 생성
pnpm prisma db seed                # (선택) 시드 데이터 주입

pnpm start:dev                     # 개발 서버 (watch, http://localhost:4000)
pnpm build                         # 프로덕션 빌드 (nest build)
pnpm start:prod                    # 빌드 결과 실행 (node dist/main)

pnpm test                          # 단위 테스트 (Jest)
pnpm test:watch                    # 테스트 watch
pnpm test:e2e                      # E2E 테스트
pnpm lint                          # ESLint (--fix)
pnpm format                        # Prettier 포맷팅
```

## Tech Stack

| 영역       | 기술                                  |
| ---------- | ------------------------------------- |
| 언어       | TypeScript 5                          |
| 프레임워크 | NestJS 11 (Express 5)                 |
| ORM        | Prisma 7 (`@prisma/adapter-pg`)       |
| DB         | PostgreSQL 16                         |
| 검증       | class-validator, class-transformer    |
| 스토리지   | 파일 시스템 + gzip (`zlib`)           |
| 테스트     | Jest 30, ts-jest, Supertest           |
| 품질       | ESLint 9, typescript-eslint, Prettier |

## Architecture

```mermaid
flowchart LR
  FE["실서비스 FE<br/>monitoring.ts + axios interceptor"] -->|POST /api/replays| API["monitoring-server<br/>NestJS"]

  API --> DB["PostgreSQL<br/>metadata"]
  API --> FS["Local Filesystem<br/>replay json.gz"]

  DASH["monitoring-dashboard<br/>React"] -->|GET /api/admin/*| API
  DASH --> PLAYER["rrweb-player"]
```

## Folder Structure

NestJS 모듈 구조로 구성되며, 수집(write)과 조회(read) 경로가 분리되어 있습니다.

```
src/
├── main.ts          # 부트스트랩: ValidationPipe(whitelist), CORS, JSON 50mb, PORT
├── app.module.ts    # 루트 모듈
├── admin/           # 대시보드용 조회 API (errors / replays)
├── replays/         # 리플레이 수집(ingestion): controller, service,
│                    #   storage(gzip), fingerprint, DTO
├── tenant/          # 테넌트 인증 (API Key + Origin allowlist) 가드
├── prisma/          # PrismaService (DB 접근)
└── common/          # 공용 응답 헬퍼 (ok, paginated 봉투)
```

**데이터 모델 (Prisma / PostgreSQL)**

- `Tenant` — 테넌트(서비스 단위), `slug`로 식별
- `ApiKey` — 테넌트별 공개 키 + 허용 Origin 목록
- `Error` — `(tenantId, fingerprint)`로 그룹화된 에러. 발생 횟수/최초·최종 발생 시각 집계
- `ErrorEvent` — 개별 발생 이벤트 (사용자·회사·브라우저·OS·디바이스 컨텍스트)
- `Replay` — 리플레이 메타데이터 + 스토리지 키(`storageKey`)

리플레이 페이로드(rrweb 이벤트·HTTP 요청·컨텍스트)는 DB가 아닌
`STORAGE_PATH/replays/<tenant>/<replayId>.json.gz` 로 gzip 압축 저장하고,
DB에는 메타데이터와 스토리지 키만 기록합니다.

## Features

- **리플레이 수집** — `POST /api/replays`
  - `public_key` + 요청 Origin으로 테넌트 인증 (API key별 Origin allowlist 검증)
  - 에러 내용으로 fingerprint 생성 → `Error` upsert(중복 그룹화, 발생 횟수 증가)
  - `ErrorEvent` 생성 및 리플레이 페이로드 gzip 저장 후 `Replay` 기록
- **Admin 조회 API** — `/api/admin/*` (대시보드 전용)

  | 메서드 | 경로                     | 설명                                                                                                    |
  | ------ | ------------------------ | ------------------------------------------------------------------------------------------------------- |
  | `GET`  | `/api/admin/errors`      | 에러 그룹 목록 (필터: `message`, `environment`, `version`, `date_from`, `date_to`, `page`, `page_size`) |
  | `GET`  | `/api/admin/errors/:id`  | 에러 상세 + 발생 이벤트                                                                                 |
  | `GET`  | `/api/admin/replays`     | 리플레이 목록                                                                                           |
  | `GET`  | `/api/admin/replays/:id` | 리플레이 상세 + 페이로드                                                                                |
  - 날짜 필터는 `lastSeenAt` 기준이며 `date_to`는 해당 일자 전체를 포함합니다.
  - 응답은 `{ success, message, data }` 봉투 형식이며, 목록은 `pagination` 정보를 포함합니다.

- **테넌트 인증** — API Key(공개 키) + Origin 허용 목록, DB 조회 타임아웃(5s) 처리
- **파일 기반 스토리지** — 리플레이 페이로드를 gzip JSON으로 저장/로드
