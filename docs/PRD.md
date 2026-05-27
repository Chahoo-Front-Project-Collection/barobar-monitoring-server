# Product Requirements Document (PRD)

## **1. 목적**

B2B 환경에서 고객사별로 분리 배포된 실서비스 프론트엔드의 오류를 중앙에서 수집하고, 오류 발생 시점 전후의 사용자 화면 흐름을 확인할 수 있는 경량 모니터링 시스템을 구축한다.

Sentry 무료 플랜의 Session Replay 제한과 OpenReplay의 높은 최소 서버 사양을 고려하여, 초기에는 rrweb 기반의 자체 경량 replay 수집 구조를 사용한다.

## **2. 문제 정의**

현재 고객사별 운영 서버가 분리되어 있어 프론트엔드 오류를 한 곳에서 추적하기 어렵다.
특히 다음 문제가 있다.

- 고객사별 프론트엔드 오류 현황을 중앙에서 확인하기 어려움
- 사용자가 어떤 화면 흐름에서 오류를 만났는지 재현하기 어려움
- Sentry 무료 플랜의 Session Replay 제공량은 B2B 다중 고객사 환경에 부족함
- OpenReplay는 무료 self-host가 가능하지만 최소 서버 사양 부담이 큼

## **3. 목표**

MVP의 목표는 다음과 같다.

1. 실서비스 FE에서 API 500 에러를 감지한다.
2. 에러 발생 시 rrweb으로 버퍼링 중이던 최근 화면 이벤트를 함께 전송한다.
3. monitoring-api는 POST /api/replays 하나로 error metadata와 replay payload를 수신한다.
4. error metadata는 PostgreSQL에 저장한다.
5. replay payload는 local filesystem에 gzip 파일로 저장한다.
6. React dashboard에서 에러 목록과 replay를 확인한다.

## **4. 비목표**

초기 MVP에서는 아래는 제외한다.

- 로그인 기능
- Redis queue
- MinIO / S3 저장소
- Slack 알림
- 고객사별 사용자 계정 관리
- OpenReplay 수준의 전체 세션 분석
- 모든 HTTP 에러 수집
- 백엔드 APM
- replay 없는 에러 단독 수집

## **5. 사용자**

주 사용자:

- 내부 개발자
- 운영 담당자

간접 사용자:

- 고객사 실서비스 사용자

## **6. 주요 기능**

Replay 수집

- 앱 시작 시 rrweb record 시작
- 최근 1~3분 이벤트만 메모리에 보관
- 500 에러 발생 시 error metadata와 replay events를 함께 POST

에러 저장

- tenant_id 기준 고객사 구분
- release, environment, page_url, request_url, status_code 저장
- 같은 에러는 fingerprint 기준으로 그룹화

대시보드

- 에러 목록 조회
- 에러 상세 조회
- replay 재생
- tenant / environment / release 필터

## **7. 성공 기준**

- 로컬 실서비스 FE에서 500 에러 발생
- POST /api/replays로 error metadata와 rrweb events가 전송됨
- PostgreSQL에 error_group, error_event, replay metadata가 저장됨
- ./storage/replays 하위에 replay json.gz 파일이 저장됨
- dashboard에서 에러 목록 확인 가능
- rrweb-player로 replay 재생 가능
