/**
 * Bố cục khai báo tay. Thêm bố cục mới = thêm 1 dòng DSL vào đây (xem cú pháp ở dsl.ts).
 * Số ảnh được tự đếm từ DSL, không cần khai báo.
 */
export const HANDCRAFTED: { dsl: string }[] = [
  // 3 ảnh
  { dsl: 'V(3:*,2:H(*,*))' },
  { dsl: 'H(3:*,2:V(2:*,*))' },
  // 4 ảnh
  { dsl: 'V(H(2:*,*),H(*,2:*))' },
  { dsl: 'H(V(2:*,*),V(*,2:*))' },
  { dsl: 'V(H(3:*,2:*),H(2:*,3:*))' },
  { dsl: 'H(*,2:V(2:*,H2))' },
  // 5 ảnh
  { dsl: 'H(V(*,H2),V(H2,*))' },
  { dsl: 'V(H(*,V2),H(V2,*))' },
  { dsl: 'V(2:H(2:*,V2),H2)' },
  { dsl: 'H(V2,2:V(2:*,H2))' },
  // 6 ảnh
  { dsl: 'H(V(H2,*),V(*,H2))' },
  { dsl: 'V(H(2:*,V2),H(V2,2:*))' },
  { dsl: 'V(H(V2,2:*),H(2:*,V2))' },
  { dsl: 'H(V(2:*,*),V(*,*),V(*,2:*))' },
  // 7 ảnh
  { dsl: 'V(H(2:*,*),H3,H(*,2:*))' },
  { dsl: 'H(V(*,H2),2:*,V(H2,*))' },
  { dsl: 'V(H(V2,2:*,V2),H2)' },
  // 8 ảnh
  { dsl: 'V(H(V2,2:*,V2),H3)' },
  { dsl: 'H(V(H2,*,H2),V(*,H2))' },
  // 9 ảnh
  { dsl: 'V(H(2:*,*,*),H(*,2:*,*),H(*,*,2:*))' },
  { dsl: 'V(H(V2,2:*,V2),H4)' },
  { dsl: 'H(V(H2,*,H2),2:V(*,H3))' },
]
