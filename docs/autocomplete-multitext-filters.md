# Hướng dẫn triển khai Autocomplete và MultiText Filter trên Nekori Plugin

Tài liệu này hướng dẫn cách sử dụng hai tính năng bộ lọc mới của ứng dụng **Nekori** (được bổ sung từ `Yuneko-dev/Nekori`, commit `7cdd62c` / PR #22):

- **Autocomplete (`autocomplete: true`)** kết hợp method `getFilterSuggestions(filterKey, query)` cho ô nhập liệu (`TextInput` và `MultiText`).
- **MultiText (`FilterTypes.MultiText`)** cho phép người dùng nhập/chọn nhiều giá trị dạng **chip** (`string[]`), thay vì phải nhồi hàng trăm/hàng nghìn mục vào `Picker` hoặc ép người dùng tự gõ chuỗi cách nhau bằng dấu phẩy.

---

## 1. Import và kiểu dữ liệu

Import đầy đủ từ `@libs/filterInputs`:

```ts
import { FilterOption, Filters, FilterTypes } from '@libs/filterInputs';
```

Trong `src/types/filters.ts` (đồng bộ với `js-runtime/src/plugins/types/filterTypes.ts` của Nekori):

| `FilterTypes` | Giá trị enum | Kiểu `value` | Hỗ trợ `autocomplete` |
| --- | --- | --- | --- |
| `FilterTypes.TextInput` | `'Text'` | `string` | Có (`autocomplete?: boolean`) |
| `FilterTypes.MultiText` | `'MultiText'` | `string[]` | Có (`autocomplete?: boolean`) |
| `FilterTypes.Picker` | `'Picker'` | `string` | Không |
| `FilterTypes.Switch` | `'Switch'` | `boolean` | Không |
| `FilterTypes.CheckboxGroup` | `'Checkbox'` | `string[]` | Không |
| `FilterTypes.ExcludableCheckboxGroup` | `'XCheckbox'` | `{ include?: string[]; exclude?: string[] }` | Không |

Kiểu phần tử gợi ý trả về là `FilterOption`:

```ts
type FilterOption = {
  readonly label: string; // Văn bản hiển thị trong danh sách gợi ý
  readonly value: string; // Giá trị thực sự được điền vào ô input hoặc thêm thành chip
};
```

---

## 2. Cú pháp khai báo `filters`

### 2.1. `TextInput` có `autocomplete: true` (chọn 1 giá trị từ danh sách lớn)

Phù hợp thay thế `Picker` có quá nhiều mục (ví dụ hàng nghìn fandom, tác giả, series...):

```ts
filters = {
  fandom: {
    type: FilterTypes.TextInput,
    label: 'Fandom / Crossover (gõ để tìm)',
    value: '',
    autocomplete: true,
  },
} satisfies Filters;
```

### 2.2. `MultiText` (chọn/nhập nhiều giá trị dạng chip)

Phù hợp cho tag, thể loại, nhân vật, hoặc danh sách từ khoá tự do:

```ts
filters = {
  // MultiText có autocomplete
  genres: {
    type: FilterTypes.MultiText,
    label: 'Thể loại (tối đa 2)',
    value: [],
    autocomplete: true,
  },

  // MultiText thuần nhập tự do (không bật autocomplete)
  excludeTags: {
    type: FilterTypes.MultiText,
    label: 'Tag muốn loại trừ',
    value: [],
  },
} satisfies Filters;
```

> [!IMPORTANT]
> Luôn giữ `satisfies Filters` ở cuối object `filters` để TypeScript tự suy ra đúng kiểu `string` cho `TextInput` và `string[]` cho `MultiText` bên trong `popularNovels`.
>
> Không gọi các hàm runtime của `@libs/*` khi khởi tạo `filters` vì bước build manifest đọc metadata bằng proxy mock.

---

## 3. Cú pháp triển khai `getFilterSuggestions`

Thêm method tuỳ chọn `getFilterSuggestions` vào class plugin (kế thừa `NekoriBasePlugin` / `NekoriPagePlugin` hoặc implement `Plugin.PluginBase` / `Plugin.PagePlugin`):

```ts
async getFilterSuggestions(
  filterKey: string,
  query: string,
): Promise<FilterOption[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];

  switch (filterKey) {
    case 'fandom':
      return searchLocalFandoms(trimmed, 6);
    case 'genres':
      return searchLocalGenres(trimmed, 6);
    default:
      return [];
  }
}
```

- **`filterKey`**: Chính là tên khoá trong object `filters` (ví dụ `'fandom'`, `'genres'`).
- **`query`**: Chuỗi người dùng đang gõ (app đã `.trim()` trước khi gọi).
- **Giá trị trả về**: `Promise<FilterOption[]>` với mỗi phần tử gồm `{ label, value }`.
  - Phần tử có `value` rỗng hoặc toàn khoảng trắng sẽ bị Nekori bỏ qua.
  - Nếu `label` rỗng, Nekori tự fallback dùng `value` làm `label`.
  - Nếu plugin không cài `getFilterSuggestions`, app trả về `[]` và ô nhập hoạt động như text thường.

### Hai mô hình lấy dữ liệu gợi ý

#### Cách A: Tìm kiếm trên danh mục cục bộ (In-memory)

Phù hợp khi site không có API autocomplete công khai hoặc hay bị Cloudflare chặn (ví dụ: `plugins/english/FanFiction`):

```ts
const ITEMS: readonly FilterOption[] = [
  { label: 'Anime: Naruto (444K+)', value: '/anime/Naruto/' },
  { label: 'Books: Harry Potter (840K+)', value: '/book/Harry-Potter/' },
];

async getFilterSuggestions(
  filterKey: string,
  query: string,
): Promise<FilterOption[]> {
  if (filterKey !== 'fandom') return [];
  const q = query.trim().toLowerCase();
  if (!q) return [];

  return ITEMS.filter(
    item =>
      item.label.toLowerCase().includes(q) ||
      item.value.toLowerCase().includes(q),
  ).slice(0, 6);
}
```

#### Cách B: Gọi API gợi ý từ trang nguồn (Remote API)

Phù hợp khi trang nguồn có endpoint autocomplete JSON nhanh (ví dụ AO3, các trang tag search):

```ts
async getFilterSuggestions(
  filterKey: string,
  query: string,
): Promise<FilterOption[]> {
  if (filterKey !== 'fandoms') return [];
  const q = query.trim();
  if (q.length < 2) return [];

  try {
    const url = `${this.site}/autocomplete/fandom?term=${encodeURIComponent(q)}`;
    const res = await fetchApi(url, {
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) return [];

    const data = (await res.json()) as { id?: string; name?: string }[];
    return data
      .filter(item => item.name)
      .slice(0, 6)
      .map(item => ({
        label: item.name!,
        value: item.name!,
      }));
  } catch {
    return [];
  }
}
```

> [!TIP]
> Nên `try / catch` và trả `[]` khi gọi API thất bại, đồng thời giữ thời gian phản hồi dưới **5 giây** (Nekori áp dụng timeout 5 giây cho mỗi lượt gọi `getFilterSuggestions`).

---

## 4. Đọc và xử lý giá trị trong `popularNovels`

Khi người dùng bấm áp dụng bộ lọc, Nekori truyền giá trị vào `options.filters`:

- `TextInput`: `{ type: FilterTypes.TextInput, value: string }`
- `MultiText`: `{ type: FilterTypes.MultiText, value: string[] }` (mảng giữ nguyên từng chip, plugin tự quyết định cách nối chuỗi / chuyển thành query parameter).

```ts
async popularNovels(
  pageNo: number,
  options: Plugin.PopularNovelsOptions<typeof this.filters>,
): Promise<Plugin.NovelItem[]> {
  const filters = options?.filters;

  // 1. Đọc TextInput (có autocomplete)
  // Nên xử lý cả trường hợp người dùng chọn gợi ý lẫn gõ tay tự do
  const rawFandom = filters?.fandom?.value?.trim() || '';
  const fandomPath = resolveFandomPath(rawFandom); // fallback mặc định nếu rỗng

  // 2. Đọc MultiText (string[])
  const selectedGenres: string[] = filters?.genres?.value ?? [];
  const params = new URLSearchParams();
  const [genreA, genreB] = resolveGenreIds(selectedGenres);
  if (genreA) params.set('g1', genreA);
  if (genreB) params.set('g2', genreB);

  // ...
}
```

---

## 5. Hành vi & giới hạn thực tế trên App Nekori

Nắm rõ cách app Nekori xử lý sẽ giúp thiết kế UX filter mượt và tránh lỗi ngoài ý muốn:

1. **Điều kiện kích hoạt gợi ý**:
   - Người dùng phải gõ tối thiểu **2 ký tự** (sau khi `.trim()`).
   - App **debounce 250 ms** trước khi gọi plugin (và tự tăng dần backoff tối đa 8 giây nếu liên tiếp lỗi/timeout).
   - Mỗi lần gọi có **timeout 5 giây** (`5000 ms`).
   - App chỉ hiển thị tối đa **6 gợi ý** (`result.take(6)`), nên hãy sắp xếp kết quả khớp tốt nhất lên đầu.
   - App có **cache LRU 200 truy vấn** theo phiên (`filterKey + query`), nên gõ lại truy vấn cũ sẽ hiện ngay không cần gọi lại plugin.
2. **Cách hiển thị `label` và `value` (rất quan trọng!)**:
   - Popup gợi ý hiển thị `suggestion.label`.
   - Khi người dùng chạm vào một gợi ý:
     - Với `TextInput`: ô nhập sẽ nhận **`suggestion.value`** (và gửi `suggestion.value` cho `popularNovels`).
     - Với `MultiText`: app thêm **`suggestion.value`** làm **chip** (và text hiển thị trên chip cũng chính là `suggestion.value`).
   - **Khuyến nghị thiết kế**:
     - Nếu `value` vốn đã dễ hiểu (ví dụ đường dẫn `/anime/Naruto/` hoặc tên tag `Harry Potter`), dùng trực tiếp làm `value`.
     - Nếu trang web dùng mã số khó hiểu (ví dụ thể loại `'2'` = Romance, `'6'` = Adventure), hãy trả `{ label: 'Romance', value: 'Romance' }` để chip hiển thị dễ đọc, rồi map tên thể loại (và cả mã số nếu người dùng tự gõ) sang ID bên trong `popularNovels`.
3. **Thao tác với chip trên `MultiText`**:
   - Thêm chip bằng phím **Done/Enter**, nút **`+`**, dán văn bản nhiều dòng (`\n`), hoặc chọn từ popup autocomplete.
   - **Dấu phẩy `,` được giữ nguyên** (không tự tách chip), giúp hỗ trợ các tag có chứa dấu phẩy như `"Sherlock, BBC"`.
   - App tự `.trim()`, bỏ chuỗi rỗng và loại bỏ chip trùng khớp chính xác.
   - Chạm vào chip sẽ kéo giá trị quay lại ô nhập để sửa; chạm nút `X` để xoá chip.
   - Hỗ trợ lưu và khôi phục trong **Filter Presets**.
4. **Giá trị mặc định & trạng thái `hasActiveFilters`**:
   - Trên Nekori, `TextInput` được coi là đang lọc khi `value.trim() !== ''`, còn `MultiText` là khi `value.length > 0`.
   - Vì vậy nên để mặc định `value: ''` cho `TextInput` và `value: []` cho `MultiText`, rồi tự fallback về giá trị mặc định trong `popularNovels` (ví dụ `'/book/Harry-Potter/'` trong FanFiction). Nhờ đó khi người dùng mở bảng lọc hoặc bấm **Reset**, ô tìm kiếm luôn trống sẵn sàng gõ mới.

---

## 6. Ví dụ thực tế trong repository

Tham khảo trực tiếp plugin **FanFiction.Net** đã áp dụng cả hai tính năng:

- [plugins/english/FanFiction/index.ts](../plugins/english/FanFiction/index.ts):
  - `fandom`: `FilterTypes.TextInput` + `autocomplete: true` thay thế cho cả `customFandom` lẫn `Picker` dài hơn 3.500 fandom.
  - `genres`: `FilterTypes.MultiText` + `autocomplete: true` thay thế cho 2 `Picker` `Genre (A)` và `Genre (B)`.
  - `getFilterSuggestions(filterKey, query)`: phục vụ gợi ý cho cả `'fandom'` và `'genres'`.
- [plugins/english/FanFiction/fandom-search.ts](../plugins/english/FanFiction/fandom-search.ts):
  - Lập chỉ mục lười (lazy index), chuẩn hoá chữ hoa/thường và dấu, xếp hạng ưu tiên (khớp chính xác → tiền tố → ranh giới từ → chứa chuỗi → nhiều từ khoá) và phân giải path khi người dùng gõ tay hoặc dán URL.

---

## 7. Cách kiểm thử trong repo

1. **Electron Playground**:
   ```bash
   npm run dev
   ```
   Mở tab **Popular Novels** → chuyển sang **Popular** → bấm **Filters** để kiểm tra trực tiếp dropdown autocomplete và chip của `MultiText`.

2. **CLI smoke check gọi thẳng `getFilterSuggestions`**:
   ```bash
   npm run check:plugins -- --plugin fanfiction.net --method getFilterSuggestions --args '["fandom","naruto"]'
   npm run check:plugins -- --plugin fanfiction.net --method getFilterSuggestions --args '["genres","rom"]'
   ```

3. **Kiểm tra bộ lọc & build đầy đủ**:
   ```bash
   npm run lint
   npm run type-check
   npm run build:full
   npm run test:build
   npm run test:checks
   ```
