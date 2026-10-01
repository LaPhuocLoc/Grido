import type { LayoutCategory } from './types'

/**
 * Bố cục khai báo tay. Thêm bố cục mới = thêm 1 dòng DSL vào đây (xem cú pháp ở dsl.ts).
 * Số ảnh được tự đếm từ DSL, không cần khai báo.
 */
export const HANDCRAFTED: { category: LayoutCategory; dsl: string }[] = [
  // 3 ảnh
  { category: 'mosaic', dsl: 'V(3:*,2:H(*,*))' },
  { category: 'mosaic', dsl: 'H(3:*,2:V(2:*,*))' },
  // 4 ảnh
  { category: 'mosaic', dsl: 'V(H(2:*,*),H(*,2:*))' },
  { category: 'mosaic', dsl: 'H(V(2:*,*),V(*,2:*))' },
  { category: 'mosaic', dsl: 'V(H(3:*,2:*),H(2:*,3:*))' },
  { category: 'mosaic', dsl: 'H(*,2:V(2:*,H2))' },
  // 5 ảnh
  { category: 'mosaic', dsl: 'H(V(*,H2),V(H2,*))' },
  { category: 'mosaic', dsl: 'V(H(*,V2),H(V2,*))' },
  { category: 'mosaic', dsl: 'V(2:H(2:*,V2),H2)' },
  { category: 'mosaic', dsl: 'H(V2,2:V(2:*,H2))' },
  // 6 ảnh
  { category: 'mosaic', dsl: 'H(V(H2,*),V(*,H2))' },
  { category: 'mosaic', dsl: 'V(H(2:*,V2),H(V2,2:*))' },
  { category: 'mosaic', dsl: 'V(H(V2,2:*),H(2:*,V2))' },
  { category: 'mosaic', dsl: 'H(V(2:*,*),V(*,*),V(*,2:*))' },
  // 7 ảnh
  { category: 'mosaic', dsl: 'V(H(2:*,*),H3,H(*,2:*))' },
  { category: 'mosaic', dsl: 'H(V(*,H2),2:*,V(H2,*))' },
  { category: 'mosaic', dsl: 'V(H(V2,2:*,V2),H2)' },
  // 8 ảnh
  { category: 'mosaic', dsl: 'V(H(V2,2:*,V2),H3)' },
  { category: 'mosaic', dsl: 'H(V(H2,*,H2),V(*,H2))' },
  // 9 ảnh
  { category: 'mosaic', dsl: 'V(H(2:*,*,*),H(*,2:*,*),H(*,*,2:*))' },
  { category: 'mosaic', dsl: 'V(H(V2,2:*,V2),H4)' },
  { category: 'mosaic', dsl: 'H(V(H2,*,H2),2:V(*,H3))' },
]
