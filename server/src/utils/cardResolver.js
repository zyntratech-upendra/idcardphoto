const getFallback = (student, key) => {
  if (!key) return "";

  if (student[key] !== undefined && student[key] !== null) {
    return String(student[key]);
  }

  if (student.data && student.data[key] !== undefined && student.data[key] !== null) {
    return String(student.data[key]);
  }

  return "";
};

const toPlainElement = (element) => {
  if (!element) return {};
  if (typeof element.toObject === "function") {
    return element.toObject({ depopulate: true, getters: false, virtuals: false });
  }
  if (element._doc && typeof element._doc === "object") {
    return { ...element._doc };
  }
  return { ...element };
};

export const resolveElement = (element, student) => {
  const plain = toPlainElement(element);
  const type = plain.type || element?.type || "";

  if (type === "text") {
    return { ...plain, displayValue: plain.text || "" };
  }

  if (type === "field") {
    return { ...plain, displayValue: getFallback(student, plain.fieldKey) };
  }

  if (type === "photo") {
    const photoValue = getFallback(student, plain.fieldKey || "photoUrl");
    return { ...plain, displayValue: photoValue };
  }

  if (type === "qr") {
    const qrValue = getFallback(student, plain.qrValueKey || "rollNumber");
    return { ...plain, displayValue: qrValue || student.rollNumber || student.fullName };
  }

  if (type === "shape") {
    return { ...plain, displayValue: "" };
  }

  return { ...plain, displayValue: "" };
};

export const buildCardPayload = (template, student) => ({
  studentId: student._id,
  templateId: template._id,
  student: {
    fullName: student.fullName,
    rollNumber: student.rollNumber,
    department: student.department,
    course: student.course,
    year: student.year,
    email: student.email,
    phone: student.phone,
    photoUrl: student.photoUrl,
    data: student.data || {},
  },
  template: {
    name: template.name,
    width: template.width,
    height: template.height,
    backgroundColor: template.backgroundColor,
    backgroundImage: template.backgroundImage,
    overlayColor: template.overlayColor,
    overlayOpacity: template.overlayOpacity,
    elements: template.elements.map((element) => resolveElement(element, student)),
  },
});
