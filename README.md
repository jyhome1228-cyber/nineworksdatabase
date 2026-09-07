# Nineworks R2 Asset Database

Cloudflare Workers + R2 기반의 개인 이미지 CDN 업로더와 프로젝트별 라이브러리.

## Current production

- Worker: `https://nineworksdatabase.planus253.workers.dev/`
- R2 bucket: `nineworks-assets`
- R2 binding: `IMAGE_BUCKET`
- Static app: `./public`
- Worker code: `./src/index.js`

GitHub `main` 브랜치 변경 사항은 Cloudflare에 자동 배포됩니다.

## Upload

`/`

1. JPG / PNG / WEBP 이미지를 드래그
2. 프로젝트 폴더 선택 또는 새 폴더 생성
3. 브라우저에서 WebP 최적화
4. Worker가 R2에 저장
5. CDN URL / HTML / CSS 코드 생성

기본 프로젝트에는 `미분류`가 있으며 R2에서는 `uncategorized/` 경로를 사용합니다.

## Library

`/library.html`

R2에 저장된 이미지를 프로젝트 폴더별로 다시 탐색하고 관리하는 페이지입니다.

- R2 프로젝트 폴더 자동 조회
- 미분류 포함
- 파일명 검색
- 이미지 미리보기
- 개별 CDN URL / HTML / CSS 복사
- 현재 폴더 또는 검색 결과 전체 코드 복사
- 이미지가 많을 경우 페이지 단위로 더 불러오기
- 개별 이미지 삭제
- 체크박스 기반 다중 선택 삭제
- 삭제 전 확인 모달
- 삭제 완료/오류 토스트
- 마지막 이미지 삭제 후 빈 R2 prefix는 폴더 목록에서 자연스럽게 사라짐

## API

- `POST /api/upload` — WebP 이미지를 R2에 저장
- `GET /api/folders` — R2 최상위 프로젝트 폴더 목록
- `GET /api/assets?folder={folder}&limit=100&cursor={cursor}` — 프로젝트 폴더의 이미지 목록
- `DELETE /api/assets` — R2 이미지 1~100개 삭제
- `GET /cdn/{folder}/{file}.webp` — R2 이미지 전달

## Repository structure

```text
public/
  index.html
  app.js
  library.html
  library.js
  library.css
  styles.css
src/
  index.js
wrangler.jsonc
package.json
index.html      # GitHub Pages redirect only
```

## URL structure

현재:

`https://nineworksdatabase.planus253.workers.dev/cdn/aesost/20260907-...webp`

향후 커스텀 도메인 연결 시:

`https://assets.nineworks.kr/cdn/aesost/20260907-...webp`

## Authentication

웹 UI에는 GitHub token, AWS key, R2 access key, 별도 로그인 입력을 사용하지 않습니다. Worker는 Cloudflare R2 binding을 통해 `nineworks-assets` 버킷에 접근합니다.

현재는 개인용 도구를 전제로 같은 origin에서 업로드/삭제 요청을 허용합니다. Worker 주소 자체는 공개 주소이므로 외부에 공유하는 운영 도구로 확장할 경우 Cloudflare Access 같은 보호 계층을 추가하는 것이 안전합니다.
