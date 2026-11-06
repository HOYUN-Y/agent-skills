// 사용: pdf2png <입력.pdf> <출력 접두어> [폭px=1588] [텍스트출력.txt]
// 결과: <접두어>-p1.png ... (PDF 원본을 그대로 래스터화), 선택 시 페이지별 추출 텍스트
import CoreGraphics
import Foundation
import ImageIO
import PDFKit
import UniformTypeIdentifiers

let args = CommandLine.arguments
guard args.count >= 3 else {
  FileHandle.standardError.write("usage: pdf2png <in.pdf> <outPrefix> [widthPx] [text.txt]\n".data(using: .utf8)!)
  exit(2)
}
let pdfURL = URL(fileURLWithPath: args[1])
let outPrefix = args[2]
let width = args.count > 3 ? (Int(args[3]) ?? 1588) : 1588

guard let doc = CGPDFDocument(pdfURL as CFURL) else {
  FileHandle.standardError.write("cannot open \(args[1])\n".data(using: .utf8)!)
  exit(1)
}
for i in 1...doc.numberOfPages {
  guard let page = doc.page(at: i) else { continue }
  let box = page.getBoxRect(.mediaBox)
  let scale = CGFloat(width) / box.width
  let h = Int((box.height * scale).rounded())
  let ctx = CGContext(data: nil, width: width, height: h, bitsPerComponent: 8, bytesPerRow: 0,
                      space: CGColorSpace(name: CGColorSpace.sRGB)!,
                      bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)!
  ctx.setFillColor(CGColor(red: 1, green: 1, blue: 1, alpha: 1))
  ctx.fill(CGRect(x: 0, y: 0, width: width, height: h))
  ctx.interpolationQuality = .high
  ctx.scaleBy(x: scale, y: scale)
  ctx.translateBy(x: -box.origin.x, y: -box.origin.y)
  ctx.drawPDFPage(page)
  let url = URL(fileURLWithPath: "\(outPrefix)-p\(i).png")
  let dest = CGImageDestinationCreateWithURL(url as CFURL, UTType.png.identifier as CFString, 1, nil)!
  CGImageDestinationAddImage(dest, ctx.makeImage()!, nil)
  CGImageDestinationFinalize(dest)
  print("page \(i): \(Int(box.width))x\(Int(box.height))pt -> \(url.lastPathComponent)")
}
if args.count > 4, let pd = PDFDocument(url: pdfURL) {
  var text = ""
  for i in 0..<pd.pageCount {
    text += "===== PAGE \(i + 1) =====\n" + (pd.page(at: i)?.string ?? "") + "\n\n"
  }
  try? text.write(toFile: args[4], atomically: true, encoding: .utf8)
}
