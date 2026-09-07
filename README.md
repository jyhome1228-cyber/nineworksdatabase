# Nineworks Asset

Nineworks 전용 이미지 CDN 업로더입니다. Cloudflare Workers + R2 구조로 동작합니다.

## Live

- Worker: `https://nineworksdatabase.planus253.workers.dev/`
- GitHub Pages: `https://jyhome1228-cyber.github.io/nineworksdatabase/` → Worker로 자동 이동

## Flow

1. JPG / PNG / WEBP 이미지 선택 또는 드래그
2. 브라우저에서 WebP 최적화
3. `/api/upload`로 전송
4. Worker가 `IMAGE_BUCKET` R2 binding을 통해 `nineworks-assets` 버킷에 저장
5. `/cdn/{folder}/{file}.webp` URL 생성
6. URL / HTML / CSS 복사

## Structure

```text
public/
  index.html      # 업로더 UI
  styles.css      # UI 스타일
  app.js          # WebP 변환 + 업로드 + 코드 복사
src/
  index.js        # Worker API + R2 저장/전송
wrangler.jsonc    # Cloudflare 설정 / R2 binding
package.json      # Wrangler scripts
index.html        # GitHub Pages → Worker redirect
```

## Cloudflare

- Worker project: `nineworksdatabase`
- R2 bucket: `nineworks-assets`
- R2 binding: `IMAGE_BUCKET`
- Static asset binding: `ASSETS`
- workers.dev: enabled
- GitHub main branch push → Cloudflare 자동 배포

## Image URL

현재:

```text
https://nineworksdatabase.planus253.workers.dev/cdn/aesost/20260907-xxxx.webp
```

추후 커스텀 도메인 연결 시:

```text
https://assets.nineworks.kr/cdn/aesost/20260907-xxxx.webp
```

## Notes

- 웹 UI에 GitHub token, R2 API key, AWS key를 입력하지 않습니다.
- 업로드는 Worker와 R2 binding으로 처리됩니다.
- 업로더는 개인용으로 구성되어 있으며 업로드 API에는 same-origin 제한이 적용되어 있습니다.
- 외부 공개 업로드 서비스로 전환할 경우 Cloudflare Access 등의 별도 인증 계층을 추가하는 것을 권장합니다.
